import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import net from 'node:net';
import {
	buildRequestFailureLog,
	createHubServer,
	evaluateSecureRequest,
	getErrorDiagnostics,
	startHubServer
} from '../apps/hub/src/lib/server/node-server.js';
import {
	getProxyTrustConfiguration,
	LOOPBACK_PROXY_TRUST_ERROR_MESSAGE
} from '../apps/hub/src/lib/server/workos-security.js';
import { reserveLocalPort } from './helpers/network.js';

const baseEnv = {
	NODE_ENV: 'test',
	WORKOS_CLIENT_ID: 'client_fixture',
	WORKOS_API_KEY: 'sk_fixture',
	WORKOS_REDIRECT_URI: 'http://127.0.0.1:3100/auth/callback',
	WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
	ORIGIN: 'http://127.0.0.1:3100'
};

/**
 * @param {http.Server} server
 * @returns {Promise<number>}
 */
function listenOnEphemeralPort(server) {
	return new Promise((resolve, reject) => {
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				reject(new Error('expected numeric server address'));
				return;
			}
			resolve(address.port);
		});
		server.once('error', reject);
	});
}

/**
 * @param {number} port
 * @param {Record<string, string>} [headers]
 */
function httpGet(port, headers = {}) {
	return new Promise((resolve, reject) => {
		const req = http.get(
			{
				hostname: '127.0.0.1',
				port,
				path: '/favicon.svg',
				headers
			},
			(res) => {
				const chunks = [];
				res.on('data', (chunk) =>
					chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
				);
				res.on('end', () => {
					resolve({
						statusCode: res.statusCode ?? 0,
						body: Buffer.concat(chunks).toString('utf8'),
						headers: res.headers
					});
				});
			}
		);
		req.on('error', reject);
		req.setTimeout(5000, () => req.destroy(new Error('request timeout')));
	});
}

/**
 * @param {http.Server} server
 * @returns {Promise<void>}
 */
function waitForServerListening(server) {
	return new Promise((resolve, reject) => {
		if (server.listening) {
			resolve();
			return;
		}
		server.once('listening', resolve);
		server.once('error', reject);
	});
}

/**
 * @param {() => boolean} predicate
 * @param {number} [timeoutMs]
 * @returns {Promise<void>}
 */
function waitForCondition(predicate, timeoutMs = 1000) {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const interval = setInterval(() => {
			if (predicate()) {
				clearInterval(interval);
				resolve();
				return;
			}
			if (Date.now() - start >= timeoutMs) {
				clearInterval(interval);
				reject(new Error('timed out waiting for condition'));
			}
		}, 10);
	});
}

const servers = [];
afterEach(async () => {
	for (const server of servers.splice(0)) {
		await new Promise((resolve) => server.close(() => resolve()));
	}
});

describe('node server diagnostics', () => {
	it('omits sensitive diagnostics in production-mode error logs', () => {
		const cause = new Error('oauth code=secret-token');
		const err = new Error('failed for token=abc123', { cause });
		err.code = 'AUTH_FAILURE';
		const diagnostics = getErrorDiagnostics(err, {
			includeSensitiveDetails: false
		});

		assert.deepStrictEqual(diagnostics, {
			type: 'Error',
			code: 'AUTH_FAILURE'
		});
	});

	it('keeps production request failure logs redacted even when legacy debug env toggle is set', () => {
		const req = {
			method: 'GET',
			url: '/auth/callback?access_token=topsecret'
		};
		const logRecord = buildRequestFailureLog(
			req,
			new Error('failed for token=abc123'),
			{
				...baseEnv,
				NODE_ENV: 'production',
				KAIVALO_INCLUDE_SENSITIVE_ERROR_LOGS: 'true'
			}
		);

		assert.strictEqual(logRecord.pathname, '/auth/callback');
		assert.strictEqual(logRecord.error.type, 'Error');
		assert.ok(!('message' in logRecord.error));
		assert.ok(!('stack' in logRecord.error));
		assert.ok(!('causeMessage' in logRecord.error));
	});

	it('includes stack and cause diagnostics only in explicit debug mode', () => {
		const cause = new Error('oauth code=secret-token');
		const err = new Error('failed for token=abc123', { cause });
		const diagnostics = getErrorDiagnostics(err, {
			includeSensitiveDetails: true
		});

		assert.strictEqual(diagnostics.type, 'Error');
		assert.strictEqual(diagnostics.message, 'failed for token=[redacted]');
		assert.strictEqual(diagnostics.causeType, 'Error');
		assert.strictEqual(diagnostics.causeMessage, 'oauth code=[redacted]');
		assert.ok(
			typeof diagnostics.stack === 'string' && diagnostics.stack.length > 0
		);
		assert.ok(!diagnostics.stack?.includes('secret-token'));
		assert.ok(!diagnostics.stack?.includes('abc123'));
	});

	it('redacts sensitive URL query values in non-error diagnostics', () => {
		const diagnostics = getErrorDiagnostics(
			'failed callback /auth/callback?code=sensitive&state=ok',
			{
				includeSensitiveDetails: true
			}
		);

		assert.deepStrictEqual(diagnostics, {
			type: 'NonErrorThrown',
			message: 'failed callback /auth/callback?code=[redacted]&state=ok'
		});
	});

	it('builds request failure logs with a sanitized pathname and incident id', () => {
		const req = {
			method: 'GET',
			url: '/auth/callback?code=supersecret&state=sensitive'
		};
		const logRecord = buildRequestFailureLog(req, new Error('boom'), {
			...baseEnv,
			NODE_ENV: 'production'
		});

		assert.strictEqual(logRecord.pathname, '/auth/callback');
		assert.strictEqual(logRecord.method, 'GET');
		assert.strictEqual(logRecord.error.type, 'Error');
		assert.ok(!('message' in logRecord.error));
		assert.ok(!('stack' in logRecord.error));
		assert.ok(!('causeMessage' in logRecord.error));
		assert.match(logRecord.incidentId, /^[0-9a-f-]{36}$/i);
	});
});

describe('node server proxy trust handling', () => {
	it('warns once when x-forwarded-proto comes from untrusted proxy hops', async () => {
		const warnings = [];
		const logger = {
			log: () => {},
			warn: /** @param {string} message */ (message) => warnings.push(message),
			error: () => {}
		};
		const { server } = createHubServer({
			handler: (_req, res) => {
				res.statusCode = 200;
				res.end('ok');
			},
			env: {
				...baseEnv,
				TRUST_X_FORWARDED_PROTO: 'true',
				TRUSTED_PROXY_IPS: '203.0.113.9'
			},
			logger
		});
		servers.push(server);

		const port = await listenOnEphemeralPort(server);
		await httpGet(port, { 'x-forwarded-proto': 'https' });
		await httpGet(port, { 'x-forwarded-proto': 'https' });

		assert.deepStrictEqual(warnings, [
			'Ignoring x-forwarded-proto from untrusted proxy address'
		]);
	});

	it('returns a 500 response when async request handlers reject', async () => {
		const errors = [];
		const logger = {
			log: () => {},
			warn: () => {},
			error: /** @param {string} message */ (message) => errors.push(message)
		};
		const { server } = createHubServer({
			handler: async () => {
				throw new Error('async failure');
			},
			env: {
				...baseEnv
			},
			logger
		});
		servers.push(server);

		const port = await listenOnEphemeralPort(server);
		const response = await httpGet(port);

		assert.strictEqual(response.statusCode, 500);
		assert.strictEqual(response.body, 'Internal Server Error');
		assert.strictEqual(response.headers['cache-control'], 'private, no-store');
		assert.strictEqual(response.headers['x-frame-options'], 'DENY');
		assert.strictEqual(response.headers['x-content-type-options'], 'nosniff');
		assert.strictEqual(
			response.headers['referrer-policy'],
			'strict-origin-when-cross-origin'
		);
		assert.strictEqual(
			response.headers['permissions-policy'],
			'camera=(), microphone=(), geolocation=()'
		);
		assert.deepStrictEqual(errors, ['Request handler failed']);
	});

	it('accepts trusted proxy x-forwarded-proto values', () => {
		const trusted = evaluateSecureRequest(
			{
				headers: { 'x-forwarded-proto': 'https' },
				socket: { remoteAddress: '::ffff:127.0.0.1', encrypted: undefined }
			},
			true,
			new Set(['127.0.0.1'])
		);
		const untrusted = evaluateSecureRequest(
			{
				headers: { 'x-forwarded-proto': 'https' },
				socket: { remoteAddress: '198.51.100.20', encrypted: undefined }
			},
			true,
			new Set(['127.0.0.1'])
		);

		assert.strictEqual(trusted.isSecure, true);
		assert.strictEqual(trusted.ignoredForwardedProto, false);
		assert.strictEqual(untrusted.isSecure, false);
		assert.strictEqual(untrusted.ignoredForwardedProto, true);
	});

	it('uses the right-most trusted proxy proto hop from comma-separated values', () => {
		const trustedHttpsHop = evaluateSecureRequest(
			{
				headers: { 'x-forwarded-proto': 'http, https' },
				socket: { remoteAddress: '::ffff:127.0.0.1', encrypted: undefined }
			},
			true,
			new Set(['127.0.0.1'])
		);
		const trustedHttpHop = evaluateSecureRequest(
			{
				headers: { 'x-forwarded-proto': 'https, http' },
				socket: { remoteAddress: '::ffff:127.0.0.1', encrypted: undefined }
			},
			true,
			new Set(['127.0.0.1'])
		);

		assert.strictEqual(trustedHttpsHop.isSecure, true);
		assert.strictEqual(trustedHttpHop.isSecure, false);
	});

	it('fails fast when loopback-only trusted proxies are used for production https origins', () => {
		assert.throws(
			() =>
				getProxyTrustConfiguration(
					{
						NODE_ENV: 'production',
						TRUST_X_FORWARDED_PROTO: 'true',
						TRUSTED_PROXY_IPS: '127.0.0.1,::1'
					},
					'https://kaivalo.test'
				),
			new RegExp(
				LOOPBACK_PROXY_TRUST_ERROR_MESSAGE.replace(
					/[.*+?^${}()|[\]\\]/g,
					'\\$&'
				)
			)
		);
	});
});

describe('node server lifecycle', () => {
	it('configures bounded request timeout on created servers', () => {
		const { server } = createHubServer({
			handler: (_req, res) => res.end('ok'),
			env: baseEnv
		});
		servers.push(server);

		assert.strictEqual(server.requestTimeout, 30_000);
	});

	it('returns non-zero shutdown status when in-flight requests exceed shutdown timeout', async () => {
		/** @type {Array<{
		 *   exitCode: number;
		 *   reason: 'startup-error' | 'shutdown-timeout';
		 *   activeRequests?: number;
		 *   shutdownTimeoutMs?: number;
		 * }>} */
		const fatalEvents = [];
		let releaseRequest;
		const requestStarted = new Promise((resolve) => {
			releaseRequest = resolve;
		});
		let unblockHandler;
		const handlerBlocked = new Promise((resolve) => {
			unblockHandler = resolve;
		});

		const { server, beginShutdown } = createHubServer({
			handler: async (_req, res) => {
				releaseRequest();
				await handlerBlocked;
				res.end('ok');
			},
			env: {
				...baseEnv,
				SHUTDOWN_TIMEOUT_MS: '25'
			},
			onFatal: (details) => fatalEvents.push(details)
		});
		servers.push(server);
		const port = await listenOnEphemeralPort(server);

		const requestResult = new Promise((resolve) => {
			const req = http.get(`http://127.0.0.1:${port}/favicon.svg`, (res) => {
				res.resume();
				res.once('end', () => resolve('response'));
			});
			req.once('error', () => resolve('error'));
		});

		await requestStarted;
		const shutdownExitCode = await beginShutdown();
		assert.strictEqual(shutdownExitCode, 1);
		assert.strictEqual(fatalEvents.length, 1);
		assert.strictEqual(fatalEvents[0].exitCode, 1);
		assert.strictEqual(fatalEvents[0].reason, 'shutdown-timeout');
		assert.strictEqual(fatalEvents[0].activeRequests, 1);
		assert.strictEqual(fatalEvents[0].shutdownTimeoutMs, 25);

		unblockHandler();
		await requestResult;
	});

	it('forces timeout shutdown for half-open sockets without active requests', async () => {
		/** @type {Array<{
		 *   exitCode: number;
		 *   reason: 'startup-error' | 'shutdown-timeout';
		 *   activeRequests?: number;
		 *   shutdownTimeoutMs?: number;
		 * }>} */
		const fatalEvents = [];
		const { server, beginShutdown } = createHubServer({
			handler: (_req, res) => res.end('ok'),
			env: {
				...baseEnv,
				SHUTDOWN_TIMEOUT_MS: '25'
			},
			onFatal: (details) => fatalEvents.push(details)
		});
		servers.push(server);
		const port = await listenOnEphemeralPort(server);

		const socket = net.connect({ host: '127.0.0.1', port });
		socket.on('error', () => {});
		await new Promise((resolve, reject) => {
			socket.once('connect', resolve);
			socket.once('error', reject);
		});
		socket.write('GET /favicon.svg HTTP/1.1\r\nHost: 127.0.0.1\r\n');
		const socketClosed = new Promise((resolve) => {
			socket.once('close', () => resolve(undefined));
		});

		const shutdownResult = await Promise.race([
			beginShutdown().then((exitCode) => ({ timedOut: false, exitCode })),
			new Promise((resolve) =>
				setTimeout(() => resolve({ timedOut: true, exitCode: -1 }), 250)
			)
		]);
		assert.strictEqual(shutdownResult.timedOut, false);
		assert.strictEqual(shutdownResult.exitCode, 1);
		assert.strictEqual(fatalEvents.length, 1);
		assert.strictEqual(fatalEvents[0].reason, 'shutdown-timeout');
		assert.strictEqual(fatalEvents[0].activeRequests, 0);
		assert.strictEqual(fatalEvents[0].shutdownTimeoutMs, 25);

		await socketClosed;
	});

	it('returns hardened 503 responses once shutdown begins', async () => {
		const { server, beginShutdown } = createHubServer({
			handler: (_req, res) => res.end('ok'),
			env: baseEnv
		});

		const requestListener = server.listeners('request')[0];
		assert.strictEqual(typeof requestListener, 'function');
		void beginShutdown();

		/** @type {Record<string, string>} */
		const headers = {};
		const res = {
			statusCode: 0,
			setHeader: (name, value) => {
				headers[String(name).toLowerCase()] = String(value);
			},
			end: (body) => {
				res.body = String(body);
			},
			body: ''
		};
		const req = {
			headers: {},
			socket: { remoteAddress: '127.0.0.1', encrypted: false }
		};

		requestListener(req, res);

		assert.strictEqual(res.statusCode, 503);
		assert.strictEqual(res.body, 'Server is shutting down');
		assert.strictEqual(headers.connection, 'close');
		assert.strictEqual(headers['cache-control'], 'private, no-store');
		assert.strictEqual(headers['x-frame-options'], 'DENY');
		assert.strictEqual(headers['x-content-type-options'], 'nosniff');
		assert.strictEqual(
			headers['referrer-policy'],
			'strict-origin-when-cross-origin'
		);
		assert.strictEqual(
			headers['permissions-policy'],
			'camera=(), microphone=(), geolocation=()'
		);
	});

	it('cleans up SIGINT and SIGTERM listeners when the server closes', async () => {
		const initialSigIntListeners = process.listenerCount('SIGINT');
		const initialSigTermListeners = process.listenerCount('SIGTERM');

		const firstReservation = await reserveLocalPort();
		await firstReservation.release();
		const firstServer = startHubServer({
			handler: (_req, res) => res.end('ok'),
			env: {
				...baseEnv,
				HOST: '127.0.0.1',
				PORT: String(firstReservation.port)
			},
			logger: { log: () => {}, warn: () => {}, error: () => {} }
		});
		servers.push(firstServer);
		await waitForServerListening(firstServer);
		assert.strictEqual(
			process.listenerCount('SIGINT'),
			initialSigIntListeners + 1
		);
		assert.strictEqual(
			process.listenerCount('SIGTERM'),
			initialSigTermListeners + 1
		);
		await new Promise((resolve) => firstServer.close(() => resolve()));
		assert.strictEqual(process.listenerCount('SIGINT'), initialSigIntListeners);
		assert.strictEqual(
			process.listenerCount('SIGTERM'),
			initialSigTermListeners
		);

		const secondReservation = await reserveLocalPort();
		await secondReservation.release();
		const secondServer = startHubServer({
			handler: (_req, res) => res.end('ok'),
			env: {
				...baseEnv,
				HOST: '127.0.0.1',
				PORT: String(secondReservation.port)
			},
			logger: { log: () => {}, warn: () => {}, error: () => {} }
		});
		servers.push(secondServer);
		await waitForServerListening(secondServer);
		assert.strictEqual(
			process.listenerCount('SIGINT'),
			initialSigIntListeners + 1
		);
		assert.strictEqual(
			process.listenerCount('SIGTERM'),
			initialSigTermListeners + 1
		);
		await new Promise((resolve) => secondServer.close(() => resolve()));
		assert.strictEqual(process.listenerCount('SIGINT'), initialSigIntListeners);
		assert.strictEqual(
			process.listenerCount('SIGTERM'),
			initialSigTermListeners
		);
	});

	it('handles listen failures with controlled exit and listener cleanup', async () => {
		const initialSigIntListeners = process.listenerCount('SIGINT');
		const initialSigTermListeners = process.listenerCount('SIGTERM');
		const reservation = await reserveLocalPort();
		const logs = [];
		const fatalEvents = [];
		const logger = {
			log: () => {},
			warn: () => {},
			error: /** @param {string} message */ (message) => logs.push(message)
		};

		try {
			startHubServer({
				handler: (_req, res) => res.end('ok'),
				env: { ...baseEnv, HOST: '127.0.0.1', PORT: String(reservation.port) },
				logger,
				onFatal: (details) => fatalEvents.push(details)
			});

			await waitForCondition(() => fatalEvents.length > 0);
			assert.strictEqual(fatalEvents.length, 1);
			assert.strictEqual(fatalEvents[0].exitCode, 1);
			assert.strictEqual(fatalEvents[0].reason, 'startup-error');
			assert.deepStrictEqual(logs, ['Failed to start hub server']);
			assert.strictEqual(
				process.listenerCount('SIGINT'),
				initialSigIntListeners
			);
			assert.strictEqual(
				process.listenerCount('SIGTERM'),
				initialSigTermListeners
			);
		} finally {
			await reservation.release();
		}
	});
});
