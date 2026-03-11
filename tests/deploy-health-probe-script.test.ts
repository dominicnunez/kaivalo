import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEPLOY_HEALTH_SCRIPT_PATH = path.join(
	ROOT,
	'scripts',
	'verify-deploy-health.sh'
);

type RouteHandler = (request: http.IncomingMessage) => {
	statusCode: number;
	headers?: http.OutgoingHttpHeaders;
	body?: string;
};

type FixtureServer = {
	origin: string;
	close: () => Promise<void>;
};

type ScriptResult = {
	exitCode: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
};

const serverClosers = new Set<() => Promise<void>>();

function startFixtureServer(handler: RouteHandler): Promise<FixtureServer> {
	return new Promise((resolve, reject) => {
		const server = http.createServer((request, response) => {
			const result = handler(request);
			response.writeHead(result.statusCode, result.headers ?? {});
			response.end(result.body ?? '');
		});

		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject);
			const address = server.address();
			if (!address || typeof address === 'string') {
				void closeServer(server).finally(() =>
					reject(new Error('Fixture server did not provide a TCP address'))
				);
				return;
			}

			const close = async () => {
				serverClosers.delete(close);
				await closeServer(server);
			};
			serverClosers.add(close);

			resolve({
				origin: `http://127.0.0.1:${address.port}`,
				close
			});
		});
	});
}

function closeServer(server: http.Server): Promise<void> {
	return new Promise((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}

function createHealthyHandler(
	overrides: Partial<Record<string, RouteHandler>> = {}
): RouteHandler {
	return (request) => {
		const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
		const override = overrides[pathname];
		if (override) {
			return override(request);
		}

		switch (pathname) {
			case '/':
				return {
					statusCode: 200,
					headers: {
						'content-type': 'text/html; charset=utf-8'
					},
					body: '<!doctype html><title>ok</title>'
				};
			case '/healthz':
				return {
					statusCode: 200,
					headers: {
						'content-type': 'text/plain; charset=utf-8'
					},
					body: 'ok'
				};
			case '/auth/callback':
				return {
					statusCode: 303,
					headers: {
						location: '/?welcome=1'
					}
				};
			default:
				return {
					statusCode: 404,
					body: 'not found'
				};
		}
	};
}

function runDeployHealthScript(origin: string): Promise<ScriptResult> {
	return new Promise((resolve, reject) => {
		const child = spawn('bash', [DEPLOY_HEALTH_SCRIPT_PATH], {
			cwd: ROOT,
			env: {
				...process.env,
				DEPLOY_ORIGIN: origin,
				DEPLOY_HEALTH_RETRY_COUNT: '1',
				DEPLOY_HEALTH_RETRY_DELAY_SECONDS: '0',
				DEPLOY_HEALTH_CONNECT_TIMEOUT_SECONDS: '2',
				DEPLOY_HEALTH_MAX_TIME_SECONDS: '2'
			},
			stdio: ['ignore', 'pipe', 'pipe']
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];

		child.once('error', reject);
		child.stdout?.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
		child.stderr?.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
		child.once('exit', (exitCode, signal) => {
			resolve({
				exitCode,
				signal,
				stdout: Buffer.concat(stdout).toString('utf8'),
				stderr: Buffer.concat(stderr).toString('utf8')
			});
		});
	});
}

afterEach(async () => {
	for (const close of Array.from(serverClosers)) {
		await close();
	}
});

describe('deploy health probe script', () => {
	it('accepts the expected healthy deployment responses', async () => {
		const server = await startFixtureServer(createHealthyHandler());
		const result = await runDeployHealthScript(server.origin);

		assert.strictEqual(result.exitCode, 0, result.stderr || result.stdout);
		assert.strictEqual(result.signal, null);
	});

	it('fails when a no-redirect probe returns a redirect response', async () => {
		const server = await startFixtureServer(
			createHealthyHandler({
				'/healthz': () => ({
					statusCode: 303,
					headers: {
						location: '/maintenance'
					}
				})
			})
		);
		const result = await runDeployHealthScript(server.origin);

		assert.notStrictEqual(result.exitCode, 0);
		assert.match(
			result.stderr,
			/Expected http:\/\/127\.0\.0\.1:\d+\/healthz to return 200, received 303/
		);
	});

	it('fails when the callback redirects away from the canonical origin', async () => {
		const server = await startFixtureServer(
			createHealthyHandler({
				'/auth/callback': () => ({
					statusCode: 303,
					headers: {
						location: 'https://evil.example.test/?welcome=1'
					}
				})
			})
		);
		const result = await runDeployHealthScript(server.origin);

		assert.notStrictEqual(result.exitCode, 0);
		assert.match(
			result.stderr,
			/Expected callback redirect to stay on http:\/\/127\.0\.0\.1:\d+, received https:\/\/evil\.example\.test/
		);
	});
});
