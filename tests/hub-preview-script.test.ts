import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import {
	AUTH_ERROR_INCIDENT_QUERY_NAME,
	AUTH_ERROR_MESSAGE,
	AUTH_ERROR_QUERY_NAME,
	AUTH_ERROR_QUERY_VALUE,
	AUTH_ERROR_TIMESTAMP_QUERY_NAME,
	readVerifiedAuthError
} from '../apps/hub/src/lib/auth/auth-error-query.ts';
import {
	getHubHealthResponseViolations,
	getHubHealthUrl,
	isHubHealthResponse
} from './helpers/hub-health.ts';
import { httpGet, startHubPreview } from './helpers/hub-preview.ts';
import { assertHubBuildAvailable } from './helpers/hub-build.ts';
import { reserveLocalPort } from './helpers/network.ts';
import { createHubPreviewScriptEnv } from './helpers/hub-runtime-env.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const STARTUP_TIMEOUT_MS = 15000;
const STARTUP_DELAY_MS = 250;
const PROCESS_EXIT_TIMEOUT_MS = 5000;
const MAX_STARTUP_OUTPUT_LINES = 120;
const PREVIEW_FIXTURE_IMPORT = new URL(
	'./helpers/hub-preview-fixtures.mts',
	import.meta.url
).href;
const AUTHKIT_COOKIE_NAME = '__Host-wos_session';
const PREVIEW_AUTH_ERROR_SIGNING_SECRET = 'cd'.repeat(32);
const PREVIEW_POLLUTION_ENV = {
	TRUST_X_FORWARDED_PROTO: 'true'
} as const;
const PREVIEW_HELPER_POLLUTION_ENV = {
	TRUST_X_FORWARDED_PROTO: 'true',
	WORKOS_API_HOSTNAME: 'accounts.attacker.test',
	NODE_OPTIONS: '--require=/definitely/missing-preview-helper-fixture.cjs'
} as const;
type ProcessShutdownResult = {
	forced: boolean;
};
type PreviewScriptOptions = {
	envOverrides?: Record<string, string | undefined>;
	imports?: readonly string[];
	nodeEnv?: string;
	sanitizeInheritedRuntimeEnv?: boolean;
};
type StartedPreviewScript = {
	baseUrl: string;
	stop: () => Promise<ProcessShutdownResult>;
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
		const response = await httpGet(getHubHealthUrl(baseUrl));
		return isHubHealthResponse(response);
	} catch {
		return false;
	}
}

async function assertPreviewHealthContract(baseUrl: string): Promise<void> {
	const response = await httpGet(getHubHealthUrl(baseUrl));
	assert.deepStrictEqual(getHubHealthResponseViolations(response), []);
}

async function assertPreviewAuthRoutes(
	baseUrl: string,
	expectedAuthOrigin = 'https://api.workos.com'
): Promise<void> {
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
	assert.strictEqual(redirectLocation.origin, expectedAuthOrigin);
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

async function startPreviewScript({
	envOverrides = {},
	imports = [PREVIEW_FIXTURE_IMPORT],
	nodeEnv = 'production',
	sanitizeInheritedRuntimeEnv = true
}: PreviewScriptOptions = {}): Promise<StartedPreviewScript> {
	assertHubBuildAvailable();
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
			envOverrides,
			imports,
			nodeEnv,
			sanitizeInheritedRuntimeEnv
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
	while (Date.now() < deadline) {
		if (spawnError) {
			throw spawnError;
		}

		if (exitCode !== null || exitSignal !== null) {
			throw new Error(`preview exited before readiness: ${output.join('\n')}`);
		}

		if (await probePreviewReady(baseUrl)) {
			return {
				baseUrl,
				stop: () => stopProcessGroup(preview)
			};
		}

		await delay(STARTUP_DELAY_MS);
	}

	const shutdown = await stopProcessGroup(preview);
	assert.equal(
		shutdown.forced,
		false,
		'expected preview shutdown to exit without requiring SIGKILL fallback'
	);
	throw new Error(
		`preview did not become ready within ${STARTUP_TIMEOUT_MS}ms:\n${output.join('\n')}`
	);
}

async function assertCleanPreviewShutdown(
	preview: StartedPreviewScript
): Promise<void> {
	const shutdown = await preview.stop();
	assert.equal(
		shutdown.forced,
		false,
		'expected preview shutdown to exit without requiring SIGKILL fallback'
	);
}

async function expectPreviewStartupFailure(
	options: PreviewScriptOptions
): Promise<string> {
	try {
		await startPreviewScript(options);
		assert.fail('expected preview startup to fail');
	} catch (error) {
		assert.ok(error instanceof Error);
		return error.message;
	}
}

describe('hub preview script', () => {
	it('starts the helper-managed preview with hermetic envs even when inherited runtime envs are polluted', async () => {
		assertHubBuildAvailable();
		const restoreEnv = setProcessEnv(PREVIEW_HELPER_POLLUTION_ENV);
		let preview: Awaited<ReturnType<typeof startHubPreview>> | null = null;
		try {
			preview = await startHubPreview({ shared: false });

			await assertPreviewHealthContract(preview.baseUrl);
			const homepage = await httpGet(preview.baseUrl);
			assert.strictEqual(homepage.statusCode, 200);
			assert.match(homepage.data, /Kaivalo/i);
			await assertPreviewAuthRoutes(preview.baseUrl);
		} finally {
			if (preview) {
				await preview.stop();
			}
			restoreEnv();
		}
	});

	it('starts the built node runtime with hermetic envs even when inherited runtime envs are polluted', async () => {
		const restoreEnv = setProcessEnv(PREVIEW_POLLUTION_ENV);
		let preview: StartedPreviewScript | null = null;
		try {
			preview = await startPreviewScript({
				envOverrides: {
					HUB_PREVIEW_CALLBACK_FIXTURE_MODE: 'signed-in'
				},
				sanitizeInheritedRuntimeEnv: false
			});

			await assertPreviewHealthContract(preview.baseUrl);
			const homepage = await httpGet(preview.baseUrl);
			assert.strictEqual(homepage.statusCode, 200);
			assert.match(homepage.data, /Kaivalo/i);
			await assertPreviewAuthRoutes(preview.baseUrl);
			await assertAuthenticatedPreviewSession(preview.baseUrl);
		} finally {
			if (preview) {
				await assertCleanPreviewShutdown(preview);
			}
			restoreEnv();
		}
	});

	it('preserves explicit WorkOS hostname overrides in preview startup', async () => {
		const preview = await startPreviewScript({
			envOverrides: {
				WORKOS_API_HOSTNAME: 'accounts.example.test'
			}
		});

		try {
			await assertPreviewAuthRoutes(
				preview.baseUrl,
				'https://accounts.example.test'
			);
		} finally {
			await assertCleanPreviewShutdown(preview);
		}
	});

	it('returns signed landing-page fallback redirects and sanitized API failures for callback redirect errors', async () => {
		const preview = await startPreviewScript({
			envOverrides: {
				HUB_PREVIEW_CALLBACK_FIXTURE_MODE: 'auth-error-redirect'
			}
		});

		try {
			const browserResponse = await httpGet(
				`${preview.baseUrl}/auth/callback?code=test-code&state=test-state`,
				{
					accept: 'text/html',
					'sec-fetch-mode': 'navigate'
				}
			);
			const apiResponse = await httpGet(
				`${preview.baseUrl}/auth/callback?code=test-code&state=test-state`,
				{
					accept: 'application/json'
				}
			);

			assert.strictEqual(browserResponse.statusCode, 303);
			const browserLocation = new URL(
				String(browserResponse.headers.location),
				preview.baseUrl
			);
			assert.strictEqual(browserLocation.pathname, '/');
			assert.strictEqual(
				browserLocation.searchParams.get(AUTH_ERROR_QUERY_NAME),
				AUTH_ERROR_QUERY_VALUE
			);
			assert.deepStrictEqual(
				readVerifiedAuthError(browserLocation.searchParams, {
					secret: PREVIEW_AUTH_ERROR_SIGNING_SECRET,
					now:
						Number(
							browserLocation.searchParams.get(AUTH_ERROR_TIMESTAMP_QUERY_NAME)
						) + 1
				}),
				{
					message: AUTH_ERROR_MESSAGE,
					incidentId: browserLocation.searchParams.get(
						AUTH_ERROR_INCIDENT_QUERY_NAME
					)
				}
			);
			assert.strictEqual(
				browserResponse.headers['cache-control'],
				'private, no-store'
			);
			assert.deepStrictEqual(getSetCookieHeaders(browserResponse.headers), []);

			const apiFailure = JSON.parse(apiResponse.data) as { message: string };
			assert.strictEqual(apiResponse.statusCode, 503);
			assert.match(
				apiFailure.message,
				/^Auth callback failed\. Reference: authcb_[0-9a-f-]+$/
			);
			assert.ok(
				!apiFailure.message.includes('AUTH_FAILED'),
				'callback failure responses should not leak upstream auth codes'
			);
		} finally {
			await assertCleanPreviewShutdown(preview);
		}
	});

	it('returns sanitized 503 responses when preview sign-out fails unexpectedly', async () => {
		const preview = await startPreviewScript({
			envOverrides: {
				HUB_PREVIEW_SIGN_OUT_FIXTURE_MODE: 'throw'
			}
		});

		try {
			const response = await post(`${preview.baseUrl}/auth/sign-out`, {
				origin: preview.baseUrl,
				accept: 'application/json',
				'sec-fetch-site': 'same-origin'
			});

			const failure = JSON.parse(response.data) as { message: string };
			assert.strictEqual(response.statusCode, 503);
			assert.strictEqual(
				response.headers['cache-control'],
				'private, no-store'
			);
			assert.match(
				failure.message,
				/^Sign-out failed\. Reference: authso_[0-9a-f-]+$/
			);
			assert.ok(
				!failure.message.includes('preview secret'),
				'sign-out failures should not leak upstream error details'
			);
			assert.deepStrictEqual(getSetCookieHeaders(response.headers), []);
		} finally {
			await assertCleanPreviewShutdown(preview);
		}
	});

	it('only enables DEV_AUTH_BYPASS for loopback hosts and loopback clients in the built runtime', async () => {
		const preview = await startPreviewScript({
			nodeEnv: 'development',
			envOverrides: {
				DEV_AUTH_BYPASS: 'true',
				DEV_AUTH_BYPASS_EMAIL: 'local-dev@kaivalo.test',
				DEV_AUTH_BYPASS_FIRST_NAME: 'Local'
			},
			imports: [PREVIEW_FIXTURE_IMPORT]
		});

		try {
			const allowedResponse = await httpGet(`${preview.baseUrl}/services`, {
				accept: 'text/html'
			});
			assert.strictEqual(allowedResponse.statusCode, 200);
			assert.match(allowedResponse.data, /Local/);
			assert.match(allowedResponse.data, /local-dev@kaivalo\.test/i);

			const rejectedClientResponse = await httpGet(
				`${preview.baseUrl}/services`,
				{
					accept: 'text/html',
					'x-kaivalo-preview-peer-address': '203.0.113.25'
				}
			);
			assert.strictEqual(rejectedClientResponse.statusCode, 503);
			assert.doesNotMatch(
				rejectedClientResponse.data,
				/local-dev@kaivalo\.test/i
			);

			const previewPort = new URL(preview.baseUrl).port;
			const rejectedHostResponse = await httpGet(
				`${preview.baseUrl}/services`,
				{
					accept: 'text/html',
					host: `staging.kaivalo.test:${previewPort}`
				}
			);
			assert.strictEqual(rejectedHostResponse.statusCode, 503);
			assert.doesNotMatch(
				rejectedHostResponse.data,
				/local-dev@kaivalo\.test/i
			);
		} finally {
			await assertCleanPreviewShutdown(preview);
		}
	});

	it('fails startup when DEV_AUTH_BYPASS is enabled for a non-loopback runtime origin', async () => {
		const failureMessage = await expectPreviewStartupFailure({
			nodeEnv: 'production',
			envOverrides: {
				DEV_AUTH_BYPASS: 'true',
				ORIGIN: 'https://kaivalo.test',
				WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
				WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
				AUTH_ERROR_SIGNING_SECRET: PREVIEW_AUTH_ERROR_SIGNING_SECRET
			},
			imports: [PREVIEW_FIXTURE_IMPORT]
		});

		assert.match(
			failureMessage,
			/DEV_AUTH_BYPASS requires NODE_ENV=development with loopback-only ORIGIN and WORKOS_REDIRECT_URI callback URL/
		);
	});
});
