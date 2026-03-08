import { before, describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { ensureHubBuild } from './helpers/hub-build.js';
import { httpGet } from './helpers/hub-preview.js';
import { reserveLocalPort } from './helpers/network.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const HUB_DIR = path.join(ROOT, 'apps', 'hub');
const BUILD_ENTRY = path.join(HUB_DIR, 'server.js');
const STARTUP_RETRY_COUNT = 40;
const STARTUP_DELAY_MS = 250;
const PROCESS_EXIT_TIMEOUT_MS = 5000;

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function createFixtureEnv(port, overrides = {}) {
	const baseOrigin = overrides.ORIGIN ?? `http://127.0.0.1:${port}`;
	const redirectUri =
		overrides.WORKOS_REDIRECT_URI ?? `${baseOrigin}/auth/callback`;

	return {
		...process.env,
		PORT: String(port),
		NODE_ENV: 'production',
		WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID ?? 'client_test_fixture',
		WORKOS_API_KEY: process.env.WORKOS_API_KEY ?? 'sk_test_fixture',
		WORKOS_REDIRECT_URI: redirectUri,
		WORKOS_COOKIE_PASSWORD:
			process.env.WORKOS_COOKIE_PASSWORD ?? 'ab'.repeat(32),
		ORIGIN: baseOrigin,
		...overrides
	};
}

async function startBuiltServer(envOverrides = {}) {
	ensureHubBuild();

	const reservation = await reserveLocalPort();
	const port = reservation.port;
	const baseUrl = `http://127.0.0.1:${port}`;
	const server = spawn('node', [BUILD_ENTRY], {
		cwd: HUB_DIR,
		stdio: 'ignore',
		detached: true,
		env: createFixtureEnv(port, envOverrides)
	});
	await reservation.release();

	for (let i = 0; i < STARTUP_RETRY_COUNT; i += 1) {
		try {
			const homepage = await httpGet(baseUrl);
			if (homepage.statusCode === 200) {
				return { server, baseUrl };
			}
		} catch {
			// Keep waiting for startup.
		}
		await delay(STARTUP_DELAY_MS);
	}

	try {
		process.kill(-server.pid, 'SIGKILL');
	} catch {
		// Ignore if already down.
	}
	throw new Error('expected server to respond before timeout');
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
		'applies HSTS when a trusted proxy forwards an HTTPS public origin',
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
					'x-forwarded-proto': 'https'
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
});
