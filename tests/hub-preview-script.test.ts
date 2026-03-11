import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { httpGet } from './helpers/hub-preview.ts';
import { assertHubBuildAvailable } from './helpers/hub-build.ts';
import { reserveLocalPort } from './helpers/network.ts';
import { createHubPreviewScriptEnv } from './helpers/hub-runtime-env.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const STARTUP_TIMEOUT_MS = 15000;
const STARTUP_DELAY_MS = 250;
const PROCESS_EXIT_TIMEOUT_MS = 5000;
const MAX_STARTUP_OUTPUT_LINES = 120;
const PREVIEW_FIXTURE_IMPORT = new URL(
	'./helpers/hub-preview-fixtures.mjs',
	import.meta.url
).href;
const AUTHKIT_COOKIE_NAME = '__Host-wos_session';
const PREVIEW_POLLUTION_ENV = {
	TRUST_X_FORWARDED_PROTO: 'true',
	WORKOS_API_HOSTNAME: 'accounts.example.test'
} as const;
type ProcessShutdownResult = {
	forced: boolean;
};

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function post(url: string, headers: Record<string, string> = {}) {
	return new Promise<{
		statusCode: number | undefined;
		headers: http.IncomingHttpHeaders;
		data: string;
	}>((resolve, reject) => {
		const req = http.request(
			url,
			{
				method: 'POST',
				headers
			},
			(response) => {
				let data = '';
				response.on('data', (chunk) => {
					data += chunk;
				});
				response.on('end', () => {
					resolve({
						statusCode: response.statusCode,
						headers: response.headers,
						data
					});
				});
			}
		);

		req.on('error', reject);
		req.setTimeout(5000, () => {
			req.destroy(new Error('Request timeout'));
		});
		req.end();
	});
}

function setProcessEnv(
	overrides: Record<string, string | undefined>
): () => void {
	const previousValues = new Map<string, string | undefined>();

	for (const [name, value] of Object.entries(overrides)) {
		previousValues.set(name, process.env[name]);
		if (value === undefined) {
			delete process.env[name];
			continue;
		}
		process.env[name] = value;
	}

	return () => {
		for (const [name, value] of previousValues) {
			if (value === undefined) {
				delete process.env[name];
				continue;
			}
			process.env[name] = value;
		}
	};
}

function getSetCookieHeaders(headers: http.IncomingHttpHeaders): string[] {
	const values = headers['set-cookie'];
	if (!values) {
		return [];
	}

	return Array.isArray(values) ? values : [values];
}

function getCookiePair(
	headers: http.IncomingHttpHeaders,
	cookieName: string
): string {
	const cookieHeader = getSetCookieHeaders(headers).find((value) =>
		value.startsWith(`${cookieName}=`)
	);
	assert.ok(cookieHeader, `Expected ${cookieName} to be set`);
	return cookieHeader.split(';', 1)[0];
}

async function probePreviewReady(baseUrl: string): Promise<boolean> {
	try {
		const response = await httpGet(`${baseUrl}/healthz`);
		return response.statusCode === 200 && response.data.trim() === 'ok';
	} catch {
		return false;
	}
}

async function assertPreviewAuthRoutes(baseUrl: string): Promise<void> {
	const signOutResponse = await post(`${baseUrl}/auth/sign-out`, {
		origin: baseUrl,
		'sec-fetch-site': 'same-origin'
	});
	assert.strictEqual(signOutResponse.statusCode, 302);
	assert.strictEqual(signOutResponse.headers.location, '/');

	const signInResponse = await httpGet(`${baseUrl}/auth/sign-in`, {
		accept: 'text/html',
		'sec-fetch-mode': 'navigate'
	});
	assert.strictEqual(signInResponse.statusCode, 303);
	assert.ok(signInResponse.headers.location, 'Expected a redirect location');

	const redirectLocation = new URL(
		String(signInResponse.headers.location),
		baseUrl
	);
	assert.strictEqual(redirectLocation.origin, 'https://api.workos.com');
	assert.ok(
		redirectLocation.pathname === '/user_management/authorize' ||
			redirectLocation.pathname.startsWith('/user_management/authorize/'),
		'Expected sign-in to redirect to WorkOS authorization'
	);
	assert.strictEqual(
		redirectLocation.searchParams.get('redirect_uri'),
		`${baseUrl}/auth/callback`
	);
}

async function assertAuthenticatedPreviewSession(
	baseUrl: string
): Promise<void> {
	const callbackResponse = await httpGet(
		`${baseUrl}/auth/callback?code=test-code&state=test-state`,
		{
			accept: 'text/html',
			'sec-fetch-mode': 'navigate'
		}
	);
	assert.strictEqual(callbackResponse.statusCode, 302);
	assert.ok(callbackResponse.headers.location, 'Expected callback redirect');

	const redirectLocation = new URL(
		String(callbackResponse.headers.location),
		baseUrl
	);
	assert.strictEqual(redirectLocation.pathname, '/services');
	assert.strictEqual(redirectLocation.searchParams.get('welcome'), '1');

	const sessionCookie = getCookiePair(
		callbackResponse.headers,
		AUTHKIT_COOKIE_NAME
	);
	assert.match(sessionCookie, /^__Host-wos_session=preview-session$/);

	const servicesResponse = await httpGet(`${baseUrl}/services`, {
		accept: 'text/html',
		cookie: sessionCookie
	});
	assert.strictEqual(servicesResponse.statusCode, 200);
	assert.match(servicesResponse.data, /Preview User/i);
	assert.match(servicesResponse.data, /Open Sweep/i);
	assert.match(servicesResponse.data, /Sign out/i);
}

function stopProcessGroup(
	server: import('node:child_process').ChildProcess
): Promise<ProcessShutdownResult> {
	return new Promise((resolve) => {
		let forced = false;
		const timeout = setTimeout(() => {
			try {
				forced = true;
				process.kill(-server.pid!, 'SIGKILL');
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
			process.kill(-server.pid!, 'SIGTERM');
		} catch {
			clearTimeout(timeout);
			resolve({ forced: false });
		}
	});
}

describe('hub preview script', () => {
	it('starts the built node runtime with hermetic envs and an authenticated callback flow', async () => {
		assertHubBuildAvailable();
		const restoreEnv = setProcessEnv(PREVIEW_POLLUTION_ENV);
		try {
			const reservation = await reserveLocalPort();
			const port = reservation.port;
			const baseUrl = `http://127.0.0.1:${port}`;
			const output: string[] = [];
			const appendOutput = (chunk: Buffer | string) => {
				const text = chunk.toString();
				for (const line of text.split(/\r?\n/)) {
					if (!line) {
						continue;
					}

					output.push(line);
					if (output.length > MAX_STARTUP_OUTPUT_LINES) {
						output.shift();
					}
				}
			};

			const preview = spawn('npm', ['--prefix', 'apps/hub', 'run', 'preview'], {
				cwd: ROOT,
				stdio: ['ignore', 'pipe', 'pipe'],
				detached: true,
				env: createHubPreviewScriptEnv({
					port,
					envOverrides: {
						HUB_PREVIEW_CALLBACK_FIXTURE_MODE: 'signed-in'
					},
					imports: [PREVIEW_FIXTURE_IMPORT]
				})
			});
			preview.stdout?.on('data', appendOutput);
			preview.stderr?.on('data', appendOutput);

			await reservation.release();

			let exitCode: number | null = null;
			let exitSignal: NodeJS.Signals | null = null;
			let spawnError: Error | null = null;
			preview.once('error', (error) => {
				spawnError = error;
			});
			preview.once('exit', (code, signal) => {
				exitCode = code;
				exitSignal = signal;
			});

			const deadline = Date.now() + STARTUP_TIMEOUT_MS;
			try {
				while (Date.now() < deadline) {
					if (spawnError) {
						throw spawnError;
					}

					if (exitCode !== null || exitSignal !== null) {
						throw new Error(
							`preview exited before readiness: ${output.join('\n')}`
						);
					}

					if (await probePreviewReady(baseUrl)) {
						const homepage = await httpGet(baseUrl);
						assert.strictEqual(homepage.statusCode, 200);
						assert.match(homepage.data, /Kaivalo/i);
						await assertPreviewAuthRoutes(baseUrl);
						await assertAuthenticatedPreviewSession(baseUrl);
						return;
					}

					await delay(STARTUP_DELAY_MS);
				}

				throw new Error(
					`preview did not become ready within ${STARTUP_TIMEOUT_MS}ms:\n${output.join('\n')}`
				);
			} finally {
				const shutdown = await stopProcessGroup(preview);
				assert.equal(
					shutdown.forced,
					false,
					'expected preview shutdown to exit without requiring SIGKILL fallback'
				);
			}
		} finally {
			restoreEnv();
		}
	});
});
