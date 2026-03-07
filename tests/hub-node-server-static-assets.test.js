import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createHubServer } from '../apps/hub/src/lib/server/node-server.js';

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
 * @param {string} path
 * @returns {Promise<{statusCode: number; headers: http.IncomingHttpHeaders; body: string}>}
 */
function httpGet(port, path) {
	return new Promise((resolve, reject) => {
		const req = http.get(
			{
				hostname: '127.0.0.1',
				port,
				path
			},
			(res) => {
				const chunks = [];
				res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
				res.on('end', () => {
					resolve({
						statusCode: res.statusCode ?? 0,
						headers: res.headers,
						body: Buffer.concat(chunks).toString('utf8')
					});
				});
			}
		);
		req.on('error', reject);
		req.setTimeout(5000, () => req.destroy(new Error('request timeout')));
	});
}

const servers = [];
afterEach(async () => {
	for (const server of servers.splice(0)) {
		await new Promise((resolve) => server.close(() => resolve()));
	}
});

describe('node server static asset classification', () => {
	it('does not apply static cache headers to extension-shaped dynamic routes', async () => {
		const { server } = createHubServer({
			handler: (_req, res) => {
				res.statusCode = 200;
				res.setHeader('Content-Type', 'application/json; charset=utf-8');
				res.end('{"ok":true}');
			},
			env: baseEnv
		});
		servers.push(server);
		const port = await listenOnEphemeralPort(server);

		const dynamicResponse = await httpGet(port, '/health.json');
		const staticResponse = await httpGet(port, '/favicon.svg');

		assert.strictEqual(dynamicResponse.statusCode, 200);
		assert.strictEqual(dynamicResponse.headers['cache-control'], undefined);
		assert.strictEqual(dynamicResponse.headers['x-frame-options'], 'DENY');
		assert.strictEqual(dynamicResponse.headers['x-content-type-options'], 'nosniff');
		assert.strictEqual(dynamicResponse.headers['referrer-policy'], 'strict-origin-when-cross-origin');
		assert.strictEqual(dynamicResponse.headers['permissions-policy'], 'camera=(), microphone=(), geolocation=()');
		assert.strictEqual(staticResponse.headers['cache-control'], 'public, max-age=86400, stale-while-revalidate=600');
		assert.strictEqual(staticResponse.headers['x-content-type-options'], 'nosniff');
		assert.strictEqual(dynamicResponse.body, '{"ok":true}');
		assert.strictEqual(staticResponse.body, '{"ok":true}');
	});
});
