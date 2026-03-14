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
} from '../apps/hub/src/lib/server/node-server.ts';
import {
	getProxyTrustConfiguration,
	LOOPBACK_PROXY_TRUST_ERROR_MESSAGE
} from '../apps/hub/src/lib/server/workos-security.ts';
import { reserveLocalPort } from './helpers/network.ts';

const baseEnv = {
	NODE_ENV: 'test',
	WORKOS_CLIENT_ID: 'client_fixture',
	WORKOS_API_KEY: 'sk_fixture',
	WORKOS_REDIRECT_URI: 'http://127.0.0.1:3100/auth/callback',
	WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
	AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
	ORIGIN: 'http://127.0.0.1:3100'
};
const SOCKET_CLOSE_TIMEOUT_MS = 1_500;
const SHORT_HEADERS_TIMEOUT_MS = 100;
const SHORT_REQUEST_TIMEOUT_MS = 150;
const SHORT_KEEP_ALIVE_TIMEOUT_MS = 120;
const SHORT_KEEP_ALIVE_TIMEOUT_BUFFER_MS = 0;
const SHORT_CONNECTIONS_CHECK_INTERVAL_MS = 50;
const PARTIAL_HEADERS_REQUEST =
	'GET /favicon.svg HTTP/1.1\r\nHost: 127.0.0.1\r\n';
const PARTIAL_BODY_REQUEST =
	'POST /favicon.svg HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 4\r\n\r\n12';
const KEEP_ALIVE_REQUEST =
	'GET /favicon.svg HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: keep-alive\r\n\r\n';

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
 * @param {string} [path]
 */
function httpGet(port, headers = {}, path = '/favicon.svg') {
	return new Promise((resolve, reject) => {
		const req = http.get(
			{
				hostname: '127.0.0.1',
				port,
				path,
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
 * @param {number} port
 * @param {Record<string, string>} [headers]
 * @param {string} [path]
 */
function httpGetWithAbortObservation(
	port,
	headers = {},
	path = '/favicon.svg'
) {
	return new Promise((resolve, reject) => {
		const req = http.get(
			{
				hostname: '127.0.0.1',
				port,
				path,
				headers
			},
			(res) => {
				const chunks = [];
				let settled = false;
				const complete = (aborted) => {
					if (settled) {
						return;
					}
					settled = true;
					resolve({
						statusCode: res.statusCode ?? 0,
						body: Buffer.concat(chunks).toString('utf8'),
						headers: res.headers,
						aborted
					});
				};

				res.on('data', (chunk) =>
					chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
				);
				res.on('end', () => complete(false));
				res.on('aborted', () => complete(true));
				res.on('close', () => complete(res.complete !== true));
			}
		);
		req.on('error', reject);
		req.setTimeout(5000, () => req.destroy(new Error('request timeout')));
	});
}

/**
 * @param {number} port
 * @returns {Promise<net.Socket>}
 */
function connectRawSocket(port) {
	return new Promise((resolve, reject) => {
		const socket = net.connect({ host: '127.0.0.1', port });
		const handleError = (error) => {
			socket.off('connect', handleConnect);
			reject(error);
		};
		const handleConnect = () => {
			socket.off('error', handleError);
			resolve(socket);
		};

		socket.once('error', handleError);
		socket.once('connect', handleConnect);
	});
}

/**
 * @param {net.Socket} socket
 * @param {number} [timeoutMs]
 * @returns {Promise<{ data: string; error: Error | null; hadError: boolean }>}
 */
function waitForSocketClose(socket, timeoutMs = SOCKET_CLOSE_TIMEOUT_MS) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let socketError = null;
		const timeout = setTimeout(() => {
			reject(new Error('expected socket to close before timeout'));
		}, timeoutMs);
		timeout.unref?.();

		socket.on('data', (chunk) =>
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
		);
		socket.once('error', (error) => {
			socketError = error;
		});
		socket.once('close', (hadError) => {
			clearTimeout(timeout);
			resolve({
				data: Buffer.concat(chunks).toString('utf8'),
				error: socketError,
				hadError
			});
		});
	});
}

/**
 * @param {http.Server} server
 * @param {{
 *   headersTimeout?: number;
 *   keepAliveTimeout?: number;
 *   requestTimeout?: number;
 * }} [overrides]
 */
function applyShortConnectionTimeouts(server, overrides = {}) {
	server.headersTimeout = overrides.headersTimeout ?? SHORT_HEADERS_TIMEOUT_MS;
	server.requestTimeout = overrides.requestTimeout ?? SHORT_REQUEST_TIMEOUT_MS;
	server.keepAliveTimeout =
		overrides.keepAliveTimeout ?? SHORT_KEEP_ALIVE_TIMEOUT_MS;
	server.keepAliveTimeoutBuffer = SHORT_KEEP_ALIVE_TIMEOUT_BUFFER_MS;
	server.connectionsCheckingInterval = SHORT_CONNECTIONS_CHECK_INTERVAL_MS;
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

	it('redacts structured secret payloads in diagnostics output', () => {
		const cause = new Error(
			'upstream payload {"refresh_token":"refresh-secret","password":"super-secret"}'
		);
		const err = new Error(
			'failed for {"access_token":"abc123","client_secret":"top-secret"}',
			{ cause }
		);
		const diagnostics = getErrorDiagnostics(err, {
			includeSensitiveDetails: true
		});

		assert.strictEqual(
			diagnostics.message,
			'failed for {"access_token":[redacted],"client_secret":[redacted]}'
		);
		assert.strictEqual(
			diagnostics.causeMessage,
			'upstream payload {"refresh_token":[redacted],"password":[redacted]}'
		);
	});

	it('builds request failure logs with a sanitized pathname and incident id', () => {
		const req = {
			method: 'GET',
			url: '/auth/callback?code=supersecret&state=sensitive',
			headers: {
				'x-request-id': 'bad request id + trace'
			},
			socket: {
				remoteAddress: '::ffff:203.0.113.10'
			}
		};
		const logRecord = buildRequestFailureLog(req, new Error('boom'), {
			...baseEnv,
			NODE_ENV: 'production'
		});

		assert.strictEqual(logRecord.pathname, '/auth/callback');
		assert.strictEqual(logRecord.method, 'GET');
		assert.strictEqual(logRecord.requestId, 'bad_request_id___trace');
		assert.strictEqual(logRecord.remoteAddress, '203.0.113.10');
		assert.strictEqual(logRecord.error.type, 'Error');
		assert.ok(!('message' in logRecord.error));
		assert.ok(!('stack' in logRecord.error));
		assert.ok(!('causeMessage' in logRecord.error));
		assert.match(logRecord.incidentId, /^[0-9a-f-]{36}$/i);
	});

	it('falls back to an unknown remote address when the socket address is missing', () => {
		const req = {
			method: 'GET',
			url: '/auth/callback?code=supersecret',
			headers: {},
			socket: {
				remoteAddress: 'not-an-ip-address'
			}
		};

		const logRecord = buildRequestFailureLog(req, new Error('boom'), {
			...baseEnv,
			NODE_ENV: 'production'
		});

		assert.strictEqual(logRecord.remoteAddress, 'unknown');
		assert.strictEqual(logRecord.requestId, 'missing');
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
			error: (message, context) => errors.push([message, context])
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
		assert.match(
			response.body,
			/^Internal Server Error\. Reference: [0-9a-f-]{36}$/i
		);
		assert.match(
			String(response.headers['x-incident-id'] ?? ''),
			/^[0-9a-f-]{36}$/i
		);
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
		assert.strictEqual(errors.length, 1);
		assert.strictEqual(errors[0][0], 'Request handler failed');
		assert.strictEqual(
			response.headers['x-incident-id'],
			errors[0][1].incidentId
		);
		assert.ok(response.body.endsWith(errors[0][1].incidentId));
	});

	it('aborts partially-written responses without appending an error body', async () => {
		const errors = [];
		const logger = {
			log: () => {},
			warn: () => {},
			error: /** @param {string} message */ (message) => errors.push(message)
		};
		const { server } = createHubServer({
			handler: async (_req, res) => {
				res.statusCode = 200;
				res.setHeader('Content-Type', 'text/plain; charset=utf-8');
				res.write('partial ');
				throw new Error('failed after writing response bytes');
			},
			env: {
				...baseEnv
			},
			logger
		});
		servers.push(server);

		const port = await listenOnEphemeralPort(server);
		const response = await httpGetWithAbortObservation(
			port,
			{},
			'/partial-response'
		);

		assert.strictEqual(
			response.statusCode,
			200,
			'committed status code should remain intact after a late failure'
		);
		assert.strictEqual(response.aborted, true);
		assert.strictEqual(response.body, 'partial ');
		assert.strictEqual(
			response.headers['content-type'],
			'text/plain; charset=utf-8'
		);
		assert.strictEqual(response.headers['cache-control'], undefined);
		assert.ok(
			typeof response.headers['x-content-type-options'] === 'string',
			'security headers should still be present on committed partial responses'
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

	it('uses the proxy-controlled proto nearest the app for comma-separated values', () => {
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
	it('configures bounded request, header, and keep-alive timeouts', () => {
		const { server } = createHubServer({
			handler: (_req, res) => res.end('ok'),
			env: baseEnv
		});
		servers.push(server);

		assert.strictEqual(server.requestTimeout, 30_000);
		assert.strictEqual(server.headersTimeout, 60_000);
		assert.strictEqual(server.keepAliveTimeout, 5_000);
	});

	it('terminates slow-header connections before the handler runs', async () => {
		let requestCount = 0;
		const { server } = createHubServer({
			handler: (_req, res) => {
				requestCount += 1;
				res.end('ok');
			},
			env: baseEnv
		});
		servers.push(server);
		applyShortConnectionTimeouts(server, {
			headersTimeout: SHORT_HEADERS_TIMEOUT_MS,
			requestTimeout: SHORT_REQUEST_TIMEOUT_MS * 2
		});

		const port = await listenOnEphemeralPort(server);
		const socket = await connectRawSocket(port);
		const socketClosed = waitForSocketClose(socket);

		socket.write(PARTIAL_HEADERS_REQUEST);

		const result = await socketClosed;
		assert.strictEqual(requestCount, 0);
		assert.strictEqual(result.hadError, false);
		assert.strictEqual(result.error, null);
		assert.match(result.data, /HTTP\/1\.1 408 Request Timeout/);
		assert.match(result.data, /Connection: close/);
	});

	it('terminates incomplete request bodies once the request timeout elapses', async () => {
		let requestCount = 0;
		let receivedBody = '';
		const { server } = createHubServer({
			handler: (req, res) => {
				requestCount += 1;
				req.on('data', (chunk) => {
					receivedBody += chunk.toString('utf8');
				});
				req.on('end', () => {
					res.end('ok');
				});
			},
			env: baseEnv
		});
		servers.push(server);
		applyShortConnectionTimeouts(server, {
			headersTimeout: SHORT_REQUEST_TIMEOUT_MS * 4,
			requestTimeout: SHORT_REQUEST_TIMEOUT_MS
		});

		const port = await listenOnEphemeralPort(server);
		const socket = await connectRawSocket(port);
		const socketClosed = waitForSocketClose(socket);

		socket.write(PARTIAL_BODY_REQUEST);

		const result = await socketClosed;
		assert.strictEqual(requestCount, 1);
		assert.strictEqual(receivedBody, '12');
		assert.strictEqual(result.hadError, false);
		assert.strictEqual(result.error, null);
		assert.match(result.data, /HTTP\/1\.1 408 Request Timeout/);
		assert.ok(!result.data.includes('200 OK'));
	});

	it('closes idle keep-alive sockets after the configured timeout', async () => {
		let requestCount = 0;
		const { server } = createHubServer({
			handler: (_req, res) => {
				requestCount += 1;
				res.end('ok');
			},
			env: baseEnv
		});
		servers.push(server);
		applyShortConnectionTimeouts(server, {
			headersTimeout: SHORT_REQUEST_TIMEOUT_MS * 4,
			requestTimeout: SHORT_REQUEST_TIMEOUT_MS * 4,
			keepAliveTimeout: SHORT_KEEP_ALIVE_TIMEOUT_MS
		});

		const port = await listenOnEphemeralPort(server);
		const socket = await connectRawSocket(port);
		const socketClosed = waitForSocketClose(socket);

		socket.write(KEEP_ALIVE_REQUEST);

		const result = await socketClosed;
		assert.strictEqual(requestCount, 1);
		assert.strictEqual(result.hadError, false);
		assert.strictEqual(result.error, null);
		assert.match(result.data, /HTTP\/1\.1 200 OK/);
		assert.match(result.data, /\r\nConnection: keep-alive\r\n/i);
		assert.match(result.data, /\r\n\r\nok$/);
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

	it('allows the maximum node timer delay for shutdown timeout', async () => {
		const { server, beginShutdown } = createHubServer({
			handler: (_req, res) => res.end('ok'),
			env: {
				...baseEnv,
				SHUTDOWN_TIMEOUT_MS: '2147483647'
			}
		});
		servers.push(server);

		const shutdownExitCode = await beginShutdown();
		assert.strictEqual(shutdownExitCode, 0);
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
		const firstServer = await startHubServer({
			handler: (_req, res) => res.end('ok'),
			env: {
				...baseEnv,
				HOST: '127.0.0.1',
				PORT: String(firstReservation.port)
			},
			logger: { log: () => {}, warn: () => {}, error: () => {} }
		});
		assert.ok(firstServer);
		assert.strictEqual(firstServer.listening, true);
		servers.push(firstServer);
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
		const secondServer = await startHubServer({
			handler: (_req, res) => res.end('ok'),
			env: {
				...baseEnv,
				HOST: '127.0.0.1',
				PORT: String(secondReservation.port)
			},
			logger: { log: () => {}, warn: () => {}, error: () => {} }
		});
		assert.ok(secondServer);
		assert.strictEqual(secondServer.listening, true);
		servers.push(secondServer);
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
			const server = await startHubServer({
				handler: (_req, res) => res.end('ok'),
				env: { ...baseEnv, HOST: '127.0.0.1', PORT: String(reservation.port) },
				logger,
				onFatal: (details) => fatalEvents.push(details)
			});

			assert.strictEqual(server, null);
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

	it('logs both internal bind and public origin for proxied https deployments', async () => {
		const reservation = await reserveLocalPort();
		await reservation.release();
		const logs = [];
		const server = await startHubServer({
			handler: (_req, res) => res.end('ok'),
			env: {
				...baseEnv,
				HOST: '127.0.0.1',
				PORT: String(reservation.port),
				ORIGIN: 'https://kaivalo.test',
				WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
				TRUST_X_FORWARDED_PROTO: 'true',
				TRUSTED_PROXY_IPS: '127.0.0.1'
			},
			logger: {
				log: /** @param {string} message */ (message) => logs.push(message),
				warn: () => {},
				error: () => {}
			}
		});
		assert.ok(server);
		assert.strictEqual(server.listening, true);
		servers.push(server);

		assert.deepStrictEqual(logs, [
			`Listening on internal http://127.0.0.1:${reservation.port} (public https://kaivalo.test)`
		]);
	});

	it('uses port 3100 when PORT is unset', async () => {
		const logs = [];
		const originalListen = http.Server.prototype.listen;
		let server = null;
		let capturedPort;
		let capturedHost;

		http.Server.prototype.listen = function listen(port, host) {
			capturedPort = port;
			capturedHost = host;
			process.nextTick(() => {
				this.emit('listening');
			});
			return this;
		};

		try {
			server = await startHubServer({
				handler: (_req, res) => res.end('ok'),
				env: {
					...baseEnv,
					HOST: '127.0.0.1',
					PORT: undefined
				},
				logger: {
					log: /** @param {string} message */ (message) => logs.push(message),
					warn: () => {},
					error: () => {}
				}
			});

			assert.ok(server);
			assert.strictEqual(capturedPort, 3100);
			assert.strictEqual(capturedHost, '127.0.0.1');
			assert.deepStrictEqual(logs, ['Listening on http://127.0.0.1:3100']);
		} finally {
			http.Server.prototype.listen = originalListen;
			server?.emit('close');
		}
	});

	it('formats IPv6 bind origins correctly in startup logs', async () => {
		const logs = [];
		const originalListen = http.Server.prototype.listen;
		let server = null;

		http.Server.prototype.listen = function listen(port, host) {
			void port;
			void host;
			process.nextTick(() => {
				this.emit('listening');
			});
			return this;
		};

		try {
			server = await startHubServer({
				handler: (_req, res) => res.end('ok'),
				env: {
					...baseEnv,
					HOST: '::1',
					PORT: '3100',
					ORIGIN: 'http://[::1]:3100',
					WORKOS_REDIRECT_URI: 'http://[::1]:3100/auth/callback'
				},
				logger: {
					log: /** @param {string} message */ (message) => logs.push(message),
					warn: () => {},
					error: () => {}
				}
			});

			assert.ok(server);
			assert.deepStrictEqual(logs, ['Listening on http://[::1]:3100']);
		} finally {
			http.Server.prototype.listen = originalListen;
			server?.emit('close');
		}
	});

	it('trims HOST before binding the server', async () => {
		const originalListen = http.Server.prototype.listen;
		let server = null;
		let capturedHost;

		http.Server.prototype.listen = function listen(port, host) {
			void port;
			capturedHost = host;
			process.nextTick(() => {
				this.emit('listening');
			});
			return this;
		};

		try {
			server = await startHubServer({
				handler: (_req, res) => res.end('ok'),
				env: {
					...baseEnv,
					HOST: ' 127.0.0.1 ',
					PORT: undefined
				},
				logger: {
					log: () => {},
					warn: () => {},
					error: () => {}
				}
			});

			assert.ok(server);
			assert.strictEqual(capturedHost, '127.0.0.1');
		} finally {
			http.Server.prototype.listen = originalListen;
			server?.emit('close');
		}
	});
});
