import { before, describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ensureHubBuild } from './helpers/hub-build.ts';
import { httpGet } from './helpers/hub-preview.ts';
import { reserveLocalPort } from '../../../tests/helpers/network.ts';
import { createHubBuiltRuntimeEnv } from './helpers/hub-runtime-env.ts';

const HUB_DIR = path.resolve(import.meta.dirname, '..');
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

type PortReservation = {
	port: number;
	release: () => Promise<void>;
};
type BuiltServerProcess = ReturnType<typeof spawn>;
type StartupOutputTracker = {
	appendOutput: (chunk: Buffer | string | null | undefined) => void;
	readonly sawReadyLog: boolean;
	readonly summary: string;
};
type BuiltServerHandle = {
	server: BuiltServerProcess;
	baseUrl: string;
};
type BuiltServerExitResult = {
	exitCode: number | null;
	signal: NodeJS.Signals | null;
	output: string;
	port: number;
};
type StopProcessResult = {
	forced: boolean;
};
type HttpAgentResponse = {
	statusCode: number;
	data: string;
	headers: http.IncomingHttpHeaders;
};

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function createFixtureEnv(
	port: number,
	overrides: Record<string, string | undefined> = {},
	nodeEnv = 'production'
): NodeJS.ProcessEnv {
	const env = createHubBuiltRuntimeEnv({
		port,
		envOverrides: overrides
	});
	env.NODE_ENV = nodeEnv;
	return env;
}

function createStartupOutputTracker(): StartupOutputTracker {
	const startupOutput: string[] = [];
	let sawReadyLog = false;

	return {
		appendOutput(chunk: Buffer | string | null | undefined) {
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

function getProcessGroupId(server: BuiltServerProcess): number | null {
	return typeof server.pid === 'number' ? -server.pid : null;
}

function getAddressInfo(address: string | AddressInfo | null): AddressInfo {
	assert.ok(address && typeof address !== 'string');
	return address;
}

async function startBuiltServer(
	envOverrides: Record<string, string | undefined> = {},
	nodeEnv = 'production'
): Promise<BuiltServerHandle> {
	ensureHubBuild();

	const reservation = (await reserveLocalPort()) as PortReservation;
	const port = reservation.port;
	const baseUrl = `http://127.0.0.1:${port}`;
	const startupOutput = createStartupOutputTracker();
	const server = spawn('node', [BUILD_ENTRY], {
		cwd: HUB_DIR,
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: true,
		env: createFixtureEnv(port, envOverrides, nodeEnv)
	});
	server.stdout?.on('data', startupOutput.appendOutput);
	server.stderr?.on('data', startupOutput.appendOutput);
	await reservation.release();

	let exitCode: number | null = null;
	let exitSignal: NodeJS.Signals | null = null;
	let spawnErrorMessage: string | null = null;
	let didExit = false;
	server.once('error', (error) => {
		spawnErrorMessage = error.message;
	});
	server.once('exit', (code, signal) => {
		didExit = true;
		exitCode = code;
		exitSignal = signal;
	});

	for (let i = 0; i < STARTUP_RETRY_COUNT; i += 1) {
		if (spawnErrorMessage) {
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

	const processGroupId = getProcessGroupId(server);
	if (processGroupId !== null) {
		try {
			process.kill(processGroupId, 'SIGKILL');
		} catch {
			// Ignore if already down.
		}
	}

	let failureReason = `server did not become ready within ${STARTUP_TIMEOUT_MS}ms`;
	if (spawnErrorMessage) {
		failureReason = `spawn failed: ${spawnErrorMessage}`;
	} else if (didExit) {
		failureReason = `process exited before readiness (code ${exitCode ?? 'null'}, signal ${exitSignal ?? 'null'})`;
	}
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
	envOverrides: Record<string, string | undefined> = {},
	{ keepPortReserved = false } = {}
): Promise<BuiltServerExitResult> {
	ensureHubBuild();

	const reservation = (await reserveLocalPort()) as PortReservation;
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
		const outcome = await new Promise<{
			exitCode: number | null;
			signal: NodeJS.Signals | null;
		}>((resolve, reject) => {
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

function stopProcessGroup(
	server: BuiltServerProcess,
	signal: NodeJS.Signals = 'SIGTERM'
): Promise<StopProcessResult> {
	return new Promise((resolve) => {
		let forced = false;
		const timeout = setTimeout(() => {
			const processGroupId = getProcessGroupId(server);
			if (processGroupId === null) {
				resolve({ forced });
				return;
			}

			try {
				forced = true;
				process.kill(processGroupId, 'SIGKILL');
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

		const processGroupId = getProcessGroupId(server);
		if (processGroupId === null) {
			clearTimeout(timeout);
			resolve({ forced: false });
			return;
		}

		try {
			process.kill(processGroupId, signal);
		} catch {
			clearTimeout(timeout);
			resolve({ forced: false });
		}
	});
}

function httpGetWithAgent(
	url: string | URL,
	agent: http.Agent
): Promise<HttpAgentResponse> {
	return new Promise((resolve, reject) => {
		const req = http.get(url, { agent }, (res) => {
			const chunks: Buffer[] = [];
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

function probeServerReady(url: string): Promise<boolean> {
	return new Promise((resolve) => {
		const req = http.get(new URL(STARTUP_HEALTH_PATH, url), (res) => {
			const chunks: Buffer[] = [];
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
		await new Promise<void>((resolve) =>
			server.listen(0, '127.0.0.1', () => resolve())
		);
		const address = getAddressInfo(server.address());
		const baseUrl = `http://127.0.0.1:${address.port}`;

		try {
			assert.strictEqual(await probeServerReady(baseUrl), true);
		} finally {
			await new Promise<void>((resolve, reject) =>
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
		await new Promise<void>((resolve) =>
			server.listen(0, '127.0.0.1', () => resolve())
		);
		const address = getAddressInfo(server.address());
		const baseUrl = `http://127.0.0.1:${address.port}`;

		try {
			assert.strictEqual(await probeServerReady(baseUrl), false);
		} finally {
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			);
		}
	});
});

describe('hub production adapter runtime', () => {
	before(
		() => {
			ensureHubBuild();
		},
		{ timeout: 60000 }
	);

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
		'uses the trusted forwarded client chain before enabling DEV_AUTH_BYPASS',
		{ timeout: 30000 },
		async () => {
			const { server, baseUrl } = await startBuiltServer(
				{
					DEV_AUTH_BYPASS: 'true',
					DEV_AUTH_BYPASS_EMAIL: 'local-dev@kaivalo.test',
					DEV_AUTH_BYPASS_FIRST_NAME: 'Local',
					TRUST_X_FORWARDED_PROTO: 'true',
					TRUSTED_PROXY_IPS: '127.0.0.1'
				},
				'development'
			);

			try {
				const rejectedDirectResponse = await httpGet(`${baseUrl}/services`, {
					accept: 'text/html'
				});
				assert.strictEqual(rejectedDirectResponse.statusCode, 503);
				assert.doesNotMatch(
					rejectedDirectResponse.data,
					/local-dev@kaivalo\.test/i
				);

				const allowedProxyResponse = await httpGet(`${baseUrl}/services`, {
					accept: 'text/html',
					'x-forwarded-for': '::1'
				});
				assert.strictEqual(allowedProxyResponse.statusCode, 200);
				assert.match(allowedProxyResponse.data, /Local/);
				assert.match(allowedProxyResponse.data, /local-dev@kaivalo\.test/i);

				const rejectedProxyResponse = await httpGet(`${baseUrl}/services`, {
					accept: 'text/html',
					'x-forwarded-for': '203.0.113.25'
				});
				assert.strictEqual(rejectedProxyResponse.statusCode, 503);
				assert.doesNotMatch(
					rejectedProxyResponse.data,
					/local-dev@kaivalo\.test/i
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

				const processGroupId = getProcessGroupId(server);
				assert.ok(processGroupId !== null);
				process.kill(processGroupId, 'SIGTERM');
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
