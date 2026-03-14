import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { buildAuthErrorLandingRedirectLocation } from '../apps/hub/src/lib/auth/auth-error-query.ts';
import { getTrustedWorkosAuthOrigin } from '../apps/hub/src/lib/server/auth-origin-policy.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEPLOY_HEALTH_SCRIPT_PATH = path.join(
	ROOT,
	'scripts',
	'verify-deploy-health.sh'
);
const LOCAL_SIGN_IN_PATH = '/auth/sign-in';
const CALLBACK_PATH = '/auth/callback';
const AUTH_ERROR_SIGNING_SECRET = 'cd'.repeat(32);
const WORKOS_API_HOSTNAME = 'auth.kaivalo-login.com';
const TRUSTED_AUTH_ORIGIN = getTrustedWorkosAuthOrigin({
	apiHostname: WORKOS_API_HOSTNAME
});
const AUTH_AUTHORIZE_PATH = '/user_management/authorize';
const AUTH_ERROR_INCIDENT_ID = 'authcb_123e4567-e89b-12d3-a456-426614174000';

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
const tempDirectories = new Set<string>();

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
		const requestOrigin = `http://${request.headers.host ?? '127.0.0.1'}`;
		const pathname = new URL(request.url ?? '/', requestOrigin).pathname;
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
			case '/services':
				return {
					statusCode: 303,
					headers: {
						location: LOCAL_SIGN_IN_PATH
					}
				};
			case '/auth/sign-in': {
				const location = new URL(
					`${TRUSTED_AUTH_ORIGIN}${AUTH_AUTHORIZE_PATH}`
				);
				location.searchParams.set(
					'redirect_uri',
					`${requestOrigin}${CALLBACK_PATH}`
				);
				location.searchParams.set('screen_hint', 'sign-up');
				return {
					statusCode: 303,
					headers: {
						location: location.toString()
					}
				};
			}
			case '/auth/callback':
				return {
					statusCode: 303,
					headers: {
						location: buildAuthErrorLandingRedirectLocation({
							incidentId: AUTH_ERROR_INCIDENT_ID,
							secret: AUTH_ERROR_SIGNING_SECRET,
							origin: requestOrigin,
							now: Date.now()
						})
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

function runDeployHealthScript(
	origin: string,
	envOverrides: Record<string, string> = {}
): Promise<ScriptResult> {
	return new Promise((resolve, reject) => {
		const child = spawn('bash', [DEPLOY_HEALTH_SCRIPT_PATH], {
			cwd: ROOT,
			env: {
				...process.env,
				DEPLOY_ORIGIN: origin,
				AUTH_ERROR_SIGNING_SECRET,
				WORKOS_API_HOSTNAME,
				DEPLOY_HEALTH_RETRY_COUNT: '1',
				DEPLOY_HEALTH_RETRY_DELAY_SECONDS: '0',
				DEPLOY_HEALTH_CONNECT_TIMEOUT_SECONDS: '2',
				DEPLOY_HEALTH_MAX_TIME_SECONDS: '2',
				...envOverrides
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

function createTracingNodeBinary() {
	const tempDirectory = mkdtempSync(
		path.join(os.tmpdir(), 'kaivalo-deploy-health-node-')
	);
	const nodePath = path.join(tempDirectory, 'node');
	const argsLogPath = path.join(tempDirectory, 'node-args.log');
	const envLogPath = path.join(tempDirectory, 'node-env.log');

	tempDirectories.add(tempDirectory);
	writeFileSync(
		nodePath,
		[
			'#!/usr/bin/env bash',
			'set -euo pipefail',
			'printf "%s\\n" "$*" >> "$TRACE_NODE_ARGS_LOG"',
			'printf "%s\\n" "${AUTH_ERROR_SIGNING_SECRET:-}" >> "$TRACE_NODE_ENV_LOG"',
			'exec "$REAL_NODE_BIN" "$@"'
		].join('\n'),
		{
			mode: 0o755
		}
	);

	return {
		argsLogPath,
		envLogPath,
		nodePath
	};
}

afterEach(async () => {
	for (const close of Array.from(serverClosers)) {
		await close();
	}

	for (const tempDirectory of Array.from(tempDirectories)) {
		tempDirectories.delete(tempDirectory);
		rmSync(tempDirectory, {
			force: true,
			recursive: true
		});
	}
});

describe('deploy health probe script', () => {
	it('accepts the expected healthy deployment responses', async () => {
		const server = await startFixtureServer(createHealthyHandler());
		const result = await runDeployHealthScript(server.origin);

		assert.strictEqual(result.exitCode, 0, result.stderr || result.stdout);
		assert.strictEqual(result.signal, null);
	});

	it('keeps the callback signing secret in the node process environment instead of argv', async () => {
		const server = await startFixtureServer(createHealthyHandler());
		const { argsLogPath, envLogPath, nodePath } = createTracingNodeBinary();
		const result = await runDeployHealthScript(server.origin, {
			NODE_BIN: nodePath,
			REAL_NODE_BIN: process.execPath,
			TRACE_NODE_ARGS_LOG: argsLogPath,
			TRACE_NODE_ENV_LOG: envLogPath
		});

		assert.strictEqual(result.exitCode, 0, result.stderr || result.stdout);
		assert.strictEqual(result.signal, null);

		const argsLog = readFileSync(argsLogPath, 'utf8');
		const envLog = readFileSync(envLogPath, 'utf8');

		assert.ok(argsLog.length > 0, 'expected node invocations to be traced');
		assert.doesNotMatch(argsLog, new RegExp(AUTH_ERROR_SIGNING_SECRET, 'g'));
		assert.match(envLog, new RegExp(`^${AUTH_ERROR_SIGNING_SECRET}$`, 'm'));
	});

	it('rejects insecure non-loopback deploy origins before probing', async () => {
		const result = await runDeployHealthScript('http://not-loopback.invalid', {
			DEPLOY_HEALTH_CONNECT_TIMEOUT_SECONDS: '1',
			DEPLOY_HEALTH_MAX_TIME_SECONDS: '1'
		});

		assert.notStrictEqual(result.exitCode, 0);
		assert.match(
			result.stderr,
			/DEPLOY_ORIGIN must use https unless it targets a loopback host/
		);
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

	it('fails when the protected route does not redirect unauthenticated users', async () => {
		const server = await startFixtureServer(
			createHealthyHandler({
				'/services': () => ({
					statusCode: 503,
					body: 'auth unavailable'
				})
			})
		);
		const result = await runDeployHealthScript(server.origin);

		assert.notStrictEqual(result.exitCode, 0);
		assert.match(
			result.stderr,
			/Expected http:\/\/127\.0\.0\.1:\d+\/services to return 303, received 503/
		);
	});

	it('fails when the protected route redirects away from the local sign-in path', async () => {
		const server = await startFixtureServer(
			createHealthyHandler({
				'/services': () => ({
					statusCode: 303,
					headers: {
						location: 'https://evil.example.test/login'
					}
				})
			})
		);
		const result = await runDeployHealthScript(server.origin);

		assert.notStrictEqual(result.exitCode, 0);
		assert.match(
			result.stderr,
			/Expected services redirect to stay on http:\/\/127\.0\.0\.1:\d+, received https:\/\/evil\.example\.test/
		);
	});

	it('fails when the local sign-in route does not redirect to the hosted auth flow', async () => {
		const server = await startFixtureServer(
			createHealthyHandler({
				'/auth/sign-in': () => ({
					statusCode: 500,
					body: 'broken sign-in'
				})
			})
		);
		const result = await runDeployHealthScript(server.origin);

		assert.notStrictEqual(result.exitCode, 0);
		assert.match(
			result.stderr,
			/Expected http:\/\/127\.0\.0\.1:\d+\/auth\/sign-in to return 303, received 500/
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

	it('fails when the callback redirect does not include a signed auth error payload', async () => {
		const server = await startFixtureServer(
			createHealthyHandler({
				'/auth/callback': () => ({
					statusCode: 303,
					headers: {
						location: '/?not_signed=1'
					}
				})
			})
		);
		const result = await runDeployHealthScript(server.origin);

		assert.notStrictEqual(result.exitCode, 0);
		assert.match(
			result.stderr,
			/Expected callback redirect to include a valid signed auth error query/
		);
	});
});
