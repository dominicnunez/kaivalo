import { describe, it } from 'node:test';
import assert from 'node:assert';
import { startHubServer } from '../apps/hub/src/lib/server/node-server.js';

const baseEnv = {
	NODE_ENV: 'test',
	WORKOS_CLIENT_ID: 'client_fixture',
	WORKOS_API_KEY: 'sk_fixture',
	WORKOS_REDIRECT_URI: 'http://127.0.0.1:3100/auth/callback',
	WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
	ORIGIN: 'http://127.0.0.1:3100'
};

describe('node server port validation', () => {
	it('reports invalid out-of-range PORT values through startup fatal handling', () => {
		const logs = [];
		const fatalEvents = [];
		const server = startHubServer({
			handler: (_req, res) => res.end('ok'),
			env: { ...baseEnv, PORT: '65536' },
			logger: {
				log: () => {},
				warn: () => {},
				error: /** @param {string} message */ (message) => logs.push(message)
			},
			onFatal: (details) => fatalEvents.push(details)
		});

		assert.strictEqual(server, null);
		assert.deepStrictEqual(logs, ['Failed to start hub server']);
		assert.strictEqual(fatalEvents.length, 1);
		assert.strictEqual(fatalEvents[0].reason, 'startup-error');
		assert.strictEqual(fatalEvents[0].exitCode, 1);
		assert.strictEqual(fatalEvents[0].host, '127.0.0.1');
		assert.strictEqual(fatalEvents[0].port, 3000);
		assert.strictEqual(fatalEvents[0].error?.message, 'PORT must be between 1 and 65535');
	});

	it('reports malformed PORT values through startup fatal handling', () => {
		const fatalEvents = [];
		const server = startHubServer({
			handler: (_req, res) => res.end('ok'),
			env: { ...baseEnv, PORT: '3000abc' },
			logger: { log: () => {}, warn: () => {}, error: () => {} },
			onFatal: (details) => fatalEvents.push(details)
		});

		assert.strictEqual(server, null);
		assert.strictEqual(fatalEvents.length, 1);
		assert.strictEqual(fatalEvents[0].reason, 'startup-error');
		assert.strictEqual(fatalEvents[0].exitCode, 1);
		assert.strictEqual(fatalEvents[0].error?.message, 'PORT must be an integer between 1 and 65535');
	});
});
