import { describe, it } from 'node:test';
import assert from 'node:assert';
import { startHubServer } from '../apps/hub/src/lib/server/node-server.ts';
import {
	LOOPBACK_PROXY_TRUST_ERROR_MESSAGE,
	PROXY_HSTS_CONFIGURATION_ERROR_MESSAGE
} from '../apps/hub/src/lib/server/workos-security.ts';

const baseEnv = {
	NODE_ENV: 'test',
	WORKOS_CLIENT_ID: 'client_fixture',
	WORKOS_API_KEY: 'sk_fixture',
	WORKOS_REDIRECT_URI: 'http://127.0.0.1:3100/auth/callback',
	WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
	AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
	ORIGIN: 'http://127.0.0.1:3100'
};

/**
 * @param {Record<string, string | undefined>} env
 * @returns {Promise<{
 *   server: import('node:http').Server | null;
 *   logs: string[];
 *   fatalEvents: Array<{
 *     reason: 'startup-error' | 'shutdown-timeout';
 *     exitCode: number;
 *     host?: string;
 *     port?: number;
 *     configuredPort?: string;
 *     error?: { message?: string };
 *   }>;
 * }>}
 */
function startWithFatalCapture(env) {
	const logs = [];
	const fatalEvents = [];
	return startHubServer({
		handler: (_req, res) => res.end('ok'),
		env,
		logger: {
			log: () => {},
			warn: () => {},
			error: /** @param {string} message */ (message) => logs.push(message)
		},
		onFatal: (details) => fatalEvents.push(details)
	}).then((server) => ({
		server,
		logs,
		fatalEvents
	}));
}

describe('node server port validation', () => {
	it('reports blank HOST values through startup fatal handling', async () => {
		const { server, fatalEvents } = await startWithFatalCapture({
			...baseEnv,
			HOST: '   '
		});

		assert.strictEqual(server, null);
		assert.strictEqual(fatalEvents.length, 1);
		assert.strictEqual(fatalEvents[0].reason, 'startup-error');
		assert.strictEqual(fatalEvents[0].exitCode, 1);
		assert.strictEqual(
			fatalEvents[0].error?.message,
			'HOST must be a valid IP address or hostname'
		);
	});

	it('reports malformed HOST values through startup fatal handling', async () => {
		const { server, fatalEvents } = await startWithFatalCapture({
			...baseEnv,
			HOST: '127.0.0.1:3100'
		});

		assert.strictEqual(server, null);
		assert.strictEqual(fatalEvents.length, 1);
		assert.strictEqual(fatalEvents[0].reason, 'startup-error');
		assert.strictEqual(fatalEvents[0].exitCode, 1);
		assert.strictEqual(
			fatalEvents[0].error?.message,
			'HOST must be a valid IP address or hostname'
		);
	});

	it('reports invalid out-of-range PORT values through startup fatal handling', async () => {
		const { server, logs, fatalEvents } = await startWithFatalCapture({
			...baseEnv,
			PORT: '65536'
		});

		assert.strictEqual(server, null);
		assert.deepStrictEqual(logs, ['Failed to start hub server']);
		assert.strictEqual(fatalEvents.length, 1);
		assert.strictEqual(fatalEvents[0].reason, 'startup-error');
		assert.strictEqual(fatalEvents[0].exitCode, 1);
		assert.strictEqual(fatalEvents[0].host, '127.0.0.1');
		assert.strictEqual(fatalEvents[0].port, undefined);
		assert.strictEqual(fatalEvents[0].configuredPort, '65536');
		assert.strictEqual(
			fatalEvents[0].error?.message,
			'PORT must be between 1 and 65535'
		);
	});

	it('reports malformed PORT values through startup fatal handling', async () => {
		const { server, fatalEvents } = await startWithFatalCapture({
			...baseEnv,
			PORT: '3000abc'
		});

		assert.strictEqual(server, null);
		assert.strictEqual(fatalEvents.length, 1);
		assert.strictEqual(fatalEvents[0].reason, 'startup-error');
		assert.strictEqual(fatalEvents[0].exitCode, 1);
		assert.strictEqual(fatalEvents[0].port, undefined);
		assert.strictEqual(fatalEvents[0].configuredPort, '3000abc');
		assert.strictEqual(
			fatalEvents[0].error?.message,
			'PORT must be an integer between 1 and 65535'
		);
	});

	it('reports malformed shutdown timeout values through startup fatal handling', async () => {
		const { server, fatalEvents } = await startWithFatalCapture({
			...baseEnv,
			SHUTDOWN_TIMEOUT_MS: '30000abc'
		});

		assert.strictEqual(server, null);
		assert.strictEqual(fatalEvents.length, 1);
		assert.strictEqual(fatalEvents[0].reason, 'startup-error');
		assert.strictEqual(fatalEvents[0].exitCode, 1);
		assert.strictEqual(
			fatalEvents[0].error?.message,
			'SHUTDOWN_TIMEOUT_MS must be a positive integer'
		);
	});

	it('reports shutdown timeout values above the node timer limit', async () => {
		const { server, fatalEvents } = await startWithFatalCapture({
			...baseEnv,
			SHUTDOWN_TIMEOUT_MS: '2147483648'
		});

		assert.strictEqual(server, null);
		assert.strictEqual(fatalEvents.length, 1);
		assert.strictEqual(fatalEvents[0].reason, 'startup-error');
		assert.strictEqual(fatalEvents[0].exitCode, 1);
		assert.strictEqual(
			fatalEvents[0].error?.message,
			'SHUTDOWN_TIMEOUT_MS must be less than or equal to 2147483647'
		);
	});

	it('reports missing WorkOS environment variables through startup fatal handling', async () => {
		const { server, logs, fatalEvents } = await startWithFatalCapture({
			...baseEnv,
			WORKOS_CLIENT_ID: ''
		});

		assert.strictEqual(server, null);
		assert.deepStrictEqual(logs, ['Failed to start hub server']);
		assert.strictEqual(fatalEvents.length, 1);
		assert.strictEqual(fatalEvents[0].reason, 'startup-error');
		assert.strictEqual(fatalEvents[0].exitCode, 1);
		assert.strictEqual(
			fatalEvents[0].error?.message,
			'Missing required environment variable: WORKOS_CLIENT_ID'
		);
	});

	it('contains startup failures when the fatal callback throws', async () => {
		const logs = [];
		const server = await startHubServer({
			handler: (_req, res) => res.end('ok'),
			env: {
				...baseEnv,
				WORKOS_CLIENT_ID: ''
			},
			logger: {
				log: () => {},
				warn: () => {},
				error: /** @param {string} message */ (message) => logs.push(message)
			},
			onFatal: () => {
				throw new Error('fatal handler failure');
			}
		});

		assert.strictEqual(server, null);
		assert.deepStrictEqual(logs, [
			'Failed to start hub server',
			'Fatal handler threw'
		]);
	});

	it('reports missing trusted proxy ips when forwarded proto trust is enabled', async () => {
		const { server, logs, fatalEvents } = await startWithFatalCapture({
			...baseEnv,
			NODE_ENV: 'production',
			ORIGIN: 'https://kaivalo.test',
			WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
			TRUST_X_FORWARDED_PROTO: 'true',
			TRUSTED_PROXY_IPS: ' '
		});

		assert.strictEqual(server, null);
		assert.deepStrictEqual(logs, ['Failed to start hub server']);
		assert.strictEqual(fatalEvents.length, 1);
		assert.strictEqual(fatalEvents[0].reason, 'startup-error');
		assert.strictEqual(fatalEvents[0].exitCode, 1);
		assert.strictEqual(fatalEvents[0].error?.type, 'Error');
		assert.strictEqual(
			fatalEvents[0].error?.message,
			'TRUSTED_PROXY_IPS must be configured when TRUST_X_FORWARDED_PROTO=true'
		);
	});

	it('reports production https origins that skip trusted forwarded proto handling', async () => {
		const { server, logs, fatalEvents } = await startWithFatalCapture({
			...baseEnv,
			NODE_ENV: 'production',
			ORIGIN: 'https://kaivalo.test',
			WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
			TRUST_X_FORWARDED_PROTO: 'false',
			TRUSTED_PROXY_IPS: ''
		});

		assert.strictEqual(server, null);
		assert.deepStrictEqual(logs, ['Failed to start hub server']);
		assert.strictEqual(fatalEvents.length, 1);
		assert.strictEqual(fatalEvents[0].reason, 'startup-error');
		assert.strictEqual(fatalEvents[0].exitCode, 1);
		assert.strictEqual(fatalEvents[0].error?.type, 'Error');
		assert.strictEqual(
			fatalEvents[0].error?.message,
			PROXY_HSTS_CONFIGURATION_ERROR_MESSAGE
		);
	});

	it('reports loopback-only trusted proxies for production https origins', async () => {
		const { server, logs, fatalEvents } = await startWithFatalCapture({
			...baseEnv,
			NODE_ENV: 'production',
			ORIGIN: 'https://kaivalo.test',
			WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
			TRUST_X_FORWARDED_PROTO: 'true',
			TRUSTED_PROXY_IPS: '127.0.0.1,::1'
		});

		assert.strictEqual(server, null);
		assert.deepStrictEqual(logs, ['Failed to start hub server']);
		assert.strictEqual(fatalEvents.length, 1);
		assert.strictEqual(fatalEvents[0].reason, 'startup-error');
		assert.strictEqual(fatalEvents[0].exitCode, 1);
		assert.strictEqual(fatalEvents[0].error?.type, 'Error');
		assert.strictEqual(
			fatalEvents[0].error?.message,
			LOOPBACK_PROXY_TRUST_ERROR_MESSAGE
		);
	});
});
