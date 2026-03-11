import { before, describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { ensureHubBuild } from './helpers/hub-build.ts';
import { httpGet } from './helpers/hub-preview.ts';
import { reserveLocalPort } from './helpers/network.ts';
import { createHubBuiltRuntimeEnv } from './helpers/hub-runtime-env.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const HUB_DIR = path.join(ROOT, 'apps', 'hub');
const BUILD_ENTRY = path.join(HUB_DIR, 'server.ts');
const STARTUP_RETRY_COUNT = 40;
const STARTUP_DELAY_MS = 250;
const STARTUP_TIMEOUT_MS = STARTUP_RETRY_COUNT * STARTUP_DELAY_MS;
const PROCESS_EXIT_TIMEOUT_MS = 5000;
const STARTUP_FAILURE_TIMEOUT_MS = 10000;
const MAX_STARTUP_OUTPUT_LINES = 120;
const STARTUP_READY_PATTERN = /\bListening on\b/;
const STARTUP_PROBE_TIMEOUT_MS = 500;
const STARTUP_HEALTH_PATH = '/healthz';
const STARTUP_HEALTH_RESPONSE = 'ok';

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function createFixtureEnv(port, overrides = {}) {
	return createHubBuiltRuntimeEnv({
		port,
		envOverrides: overrides
	});
}

function createStartupOutputTracker() {
	const startupOutput = [];
	let sawReadyLog = false;

	return {
		appendOutput(chunk) {
			if (!chunk) {
				return;
			}

			const text = chunk.toString();
			if (STARTUP_READY_PATTERN.test(text)) {
				sawReadyLog = true;
			}
			for (const line of text.split(/\r?\n/)) {
				if (!line) {
					continue;
				}
				startupOutput.push(line);
				if (startupOutput.length > MAX_STARTUP_OUTPUT_LINES) {
					startupOutput.shift();
				}
			}
		},
		get sawReadyLog() {
			return sawReadyLog;
		},
		get summary() {
			return startupOutput.length
				? startupOutput.join('\n')
				: '(no startup output captured)';
		}
	};
}

async function startBuiltServer(envOverrides = {}) {
	ensureHubBuild();

	const reservation = await reserveLocalPort();
	const port = reservation.port;
	const baseUrl = `http://127.0.0.1:${port}`;
	const startupOutput = createStartupOutputTracker();
	const server = spawn('node', [BUILD_ENTRY], {
		cwd: HUB_DIR,
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: true,
		env: createFixtureEnv(port, envOverrides)
	});
	server.stdout?.on('data', startupOutput.appendOutput);
	server.stderr?.on('data', startupOutput.appendOutput);
	await reservation.release();

	let exitCode = null;
	let exitSignal = null;
	let spawnError = null;
	let didExit = false;
	server.once('error', (error) => {
		spawnError = error;
	});
	server.once('exit', (code, signal) => {
		didExit = true;
		exitCode = code;
		exitSignal = signal;
	});

	for (let i = 0; i < STARTUP_RETRY_COUNT; i += 1) {
		if (spawnError) {
			break;
		}
		if (didExit) {
			break;
		}

		if (
			(startupOutput.sawReadyLog || i % 2 === 0) &&
			(await probeServerReady(baseUrl))
		) {
			return { server, baseUrl };
		}
		await delay(STARTUP_DELAY_MS);
	}

	try {
		process.kill(-server.pid, 'SIGKILL');
	} catch {
		// Ignore if already down.
	}

	const failureReason = spawnError
		? `spawn failed: ${spawnError.message}`
		: didExit
			? `process exited before readiness (code ${exitCode ?? 'null'}, signal ${exitSignal ?? 'null'})`
			: `server did not become ready within ${STARTUP_TIMEOUT_MS}ms`;
	const readinessSummary = startupOutput.sawReadyLog
		? 'saw readiness log but health checks never succeeded'
		: 'never observed readiness log output';

	throw new Error(
		[
			`expected built server to become ready: ${failureReason}`,
			readinessSummary,
			`startup output:\n${startupOutput.summary}`
		].join('\n')
	);
}

async function runBuiltServerToExit(
	envOverrides = {},
	{ keepPortReserved = false } = {}
) {
	ensureHubBuild();

	const reservation = await reserveLocalPort();
	const port = reservation.port;
	if (!keepPortReserved) {
		await reservation.release();
	}

	const startupOutput = createStartupOutputTracker();
	const server = spawn('node', [BUILD_ENTRY], {
		cwd: HUB_DIR,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: createFixtureEnv(port, envOverrides)
	});
	server.stdout?.on('data', startupOutput.appendOutput);
	server.stderr?.on('data', startupOutput.appendOutput);

	try {
		const outcome = await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				server.kill('SIGKILL');
				reject(
					new Error(
						`expected built server entrypoint to exit within ${STARTUP_FAILURE_TIMEOUT_MS}ms`
					)
				);
			}, STARTUP_FAILURE_TIMEOUT_MS);
			timeout.unref();

			server.once('error', (error) => {
				clearTimeout(timeout);
				reject(error);
			});

			server.once('exit', (exitCode, signal) => {
				clearTimeout(timeout);
				resolve({
					exitCode,
					signal
				});
			});
		});

		return {
			...outcome,
			output: startupOutput.summary,
			port
		};
	} finally {
		if (keepPortReserved) {
			await reservation.release();
		}
	}
}

function stopProcessGroup(server, signal = 'SIGTERM') {
	return new Promise((resolve) => {
		let forced = false;
		const timeout = setTimeout(() => {
			try {
				forced = true;
				process.kill(-server.pid, 'SIGKILL');
			} catch {
				// Ignore already-stopped process.
			}
			resolve({ forced });
		}, PROCESS_EXIT_TIMEOUT_MS);
		timeout.unref();

		server.once('exit', () => {
			clearTimeout(timeout);
			resolve({ forced });
		});

		try {
			process.kill(-server.pid, signal);
		} catch {
			clearTimeout(timeout);
			resolve({ forced: false });
		}
	});
}

function httpGetWithAgent(url, agent) {
	return new Promise((resolve, reject) => {
		const req = http.get(url, { agent }, (res) => {
			const chunks = [];
			res.on('data', (chunk) =>
				chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
			);
			res.on('end', () => {
				resolve({
					statusCode: res.statusCode ?? 0,
					data: Buffer.concat(chunks).toString('utf8'),
					headers: res.headers
				});
			});
		});
		req.on('error', reject);
		req.setTimeout(5000, () => req.destroy(new Error('request timeout')));
	});
}

function probeServerReady(url) {
	return new Promise((resolve) => {
		const req = http.get(new URL(STARTUP_HEALTH_PATH, url), (res) => {
			const chunks = [];
			res.on('data', (chunk) =>
				chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
			);
			res.once('end', () => {
				resolve(
					res.statusCode === 200 &&
						Buffer.concat(chunks).toString('utf8').trim() ===
							STARTUP_HEALTH_RESPONSE
				);
			});
		});
		req.on('error', () => resolve(false));
		req.setTimeout(STARTUP_PROBE_TIMEOUT_MS, () => {
			req.destroy(new Error('startup probe timeout'));
			resolve(false);
		});
	});
}

describe('hub production readiness probe', () => {
	it('accepts a healthy 200 healthz response', async () => {
		const server = http.createServer((request, response) => {
			if (request.url === STARTUP_HEALTH_PATH) {
				response.writeHead(200, { 'content-type': 'text/plain' });
				response.end(STARTUP_HEALTH_RESPONSE);
				return;
			}

			response.writeHead(404);
			response.end('not found');
		});
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		const baseUrl = `http://127.0.0.1:${address.port}`;

		try {
			assert.strictEqual(await probeServerReady(baseUrl), true);
		} finally {
			await new Promise((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			);
		}
	});

	it('rejects non-200 startup responses', async () => {
		const server = http.createServer((request, response) => {
			if (request.url === STARTUP_HEALTH_PATH) {
				response.writeHead(500, { 'content-type': 'text/plain' });
				response.end('Internal Server Error');
				return;
			}

			response.writeHead(404);
			response.end('not found');
		});
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		const baseUrl = `http://127.0.0.1:${address.port}`;

		try {
			assert.strictEqual(await probeServerReady(baseUrl), false);
		} finally {
			await new Promise((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			);
		}
	});
});

describe('hub production adapter runtime', () => {
	before({ timeout: 60000 }, () => {
		ensureHubBuild();
	});

	it(
		'starts the built node server and serves the landing page',
		{ timeout: 30000 },
		async () => {
			const { server, baseUrl } = await startBuiltServer();

			try {
				const homepage = await httpGet(baseUrl);
				assert.strictEqual(homepage.statusCode, 200);
				assert.ok(homepage.data.includes('Kaivalo'));
				assert.ok(homepage.data.toLowerCase().includes('<!doctype html>'));
			} finally {
				await stopProcessGroup(server);
			}
		}
	);

	it(
		'applies static asset security headers in the node adapter entrypoint',
		{ timeout: 30000 },
		async () => {
			const { server, baseUrl } = await startBuiltServer();

			try {
				const staticAsset = await httpGet(`${baseUrl}/favicon.svg`);
				assert.strictEqual(staticAsset.statusCode, 200);
				assert.strictEqual(staticAsset.headers['x-frame-options'], 'DENY');
				assert.strictEqual(
					staticAsset.headers['x-content-type-options'],
					'nosniff'
				);
				assert.strictEqual(
					staticAsset.headers['referrer-policy'],
					'strict-origin-when-cross-origin'
				);
				assert.strictEqual(
					staticAsset.headers['permissions-policy'],
					'camera=(), microphone=(), geolocation=()'
				);
				assert.strictEqual(
					staticAsset.headers['cache-control'],
					'public, max-age=86400, stale-while-revalidate=600'
				);
			} finally {
				await stopProcessGroup(server);
			}
		}
	);

	it(
		'applies HSTS when a trusted proxy forwards the nearest HTTPS hop through multiple proto values',
		{ timeout: 30000 },
		async () => {
			const { server, baseUrl } = await startBuiltServer({
				ORIGIN: 'https://kaivalo.test',
				WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
				TRUST_X_FORWARDED_PROTO: 'true',
				TRUSTED_PROXY_IPS: '127.0.0.1,203.0.113.9'
			});

			try {
				const homepage = await httpGet(baseUrl, {
					'x-forwarded-proto': 'http, https'
				});
				assert.strictEqual(homepage.statusCode, 200);
				assert.ok(homepage.data.includes('Kaivalo'));
				assert.strictEqual(
					homepage.headers['strict-transport-security'],
					'max-age=63072000; includeSubDomains'
				);
				assert.strictEqual(
					homepage.headers['cache-control'],
					'public, max-age=300, stale-while-revalidate=60'
				);
			} finally {
				await stopProcessGroup(server);
			}
		}
	);

	it(
		'drains keep-alive clients and exits cleanly on SIGTERM',
		{ timeout: 30000 },
		async () => {
			const { server, baseUrl } = await startBuiltServer();
			const keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 1 });

			try {
				const warmup = await httpGetWithAgent(baseUrl, keepAliveAgent);
				assert.strictEqual(warmup.statusCode, 200);

				process.kill(-server.pid, 'SIGTERM');
				let shutdownOutcome = null;
				for (let i = 0; i < 10; i += 1) {
					try {
						const attempt = await httpGetWithAgent(baseUrl, keepAliveAgent);
						if (attempt.statusCode === 503) {
							shutdownOutcome = '503';
							break;
						}
					} catch {
						shutdownOutcome = 'closed';
						break;
					}
					await delay(30);
				}

				assert.ok(
					shutdownOutcome,
					'expected shutdown to either return 503 or close connections'
				);
			} finally {
				keepAliveAgent.destroy();
				const shutdown = await stopProcessGroup(server, 'SIGTERM');
				assert.strictEqual(
					shutdown.forced,
					false,
					'expected graceful shutdown to exit without requiring SIGKILL fallback'
				);
			}
		}
	);

	it(
		'exits non-zero when the shipped node entrypoint starts without required auth env',
		{ timeout: 30000 },
		async () => {
			const result = await runBuiltServerToExit({
				WORKOS_CLIENT_ID: ''
			});

			assert.strictEqual(result.exitCode, 1);
			assert.strictEqual(result.signal, null);
			assert.match(result.output, /Failed to start hub server/);
			assert.match(
				result.output,
				/Missing required environment variable: WORKOS_CLIENT_ID/
			);
			assert.doesNotMatch(result.output, STARTUP_READY_PATTERN);
		}
	);

	it(
		'exits non-zero when the shipped node entrypoint cannot bind its configured port',
		{ timeout: 30000 },
		async () => {
			const result = await runBuiltServerToExit({}, { keepPortReserved: true });

			assert.strictEqual(result.exitCode, 1);
			assert.strictEqual(result.signal, null);
			assert.match(result.output, /Failed to start hub server/);
			assert.match(result.output, /\bEADDRINUSE\b|address already in use/i);
			assert.match(result.output, new RegExp(`\\b${result.port}\\b`));
			assert.doesNotMatch(result.output, STARTUP_READY_PATTERN);
		}
	);
});
