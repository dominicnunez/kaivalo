import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { canListenOnLoopback } from './helpers/runtime-capabilities.ts';

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
const TRUSTED_AUTH_ORIGIN = `https://${WORKOS_API_HOSTNAME}`;
const AUTH_AUTHORIZE_PATH = '/user_management/authorize';
const LOOPBACK_LISTEN_SUPPORTED = await canListenOnLoopback();
const AUTH_ERROR_INCIDENT_ID = 'authcb_123e4567-e89b-12d3-a456-426614174000';
const AUTH_ERROR_MESSAGE =
	'Sign-in is temporarily unavailable. Please try again shortly.';
const AUTH_ERROR_QUERY_NAME = 'error';
const AUTH_ERROR_QUERY_VALUE = 'auth';
const AUTH_ERROR_INCIDENT_QUERY_NAME = 'incident';
const AUTH_ERROR_TIMESTAMP_QUERY_NAME = 'ts';
const AUTH_ERROR_SIGNATURE_QUERY_NAME = 'sig';
const AUTH_ERROR_QUERY_TTL_MS = 5 * 60 * 1000;
const AUTH_ERROR_MAX_FUTURE_SKEW_MS = 30 * 1000;
const AUTH_ERROR_INCIDENT_ID_PATTERN =
	/^auth(?:cb|sign)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECURITY_HEADERS = {
	'x-frame-options': 'DENY',
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy': 'camera=(), microphone=(), geolocation=()'
} as const;
const PUBLIC_DOCUMENT_CACHE_CONTROL =
	'public, max-age=300, stale-while-revalidate=60';
const PRIVATE_NO_STORE_CACHE_CONTROL = 'private, no-store';
const HEALTH_CACHE_CONTROL = 'no-store';

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

function signAuthErrorIncident(
	incidentId: string,
	timestamp: string,
	secret: string
): string {
	return createHmac('sha256', secret)
		.update(`${incidentId}:${timestamp}`)
		.digest('base64url');
}

function buildTestAuthErrorLandingRedirectLocation({
	incidentId,
	secret,
	origin,
	now = Date.now()
}: {
	incidentId: string;
	secret: string;
	origin: string;
	now?: number;
}): string {
	const landingUrl = new URL('/', new URL(origin).origin);
	const timestamp = String(now);

	landingUrl.searchParams.set(AUTH_ERROR_QUERY_NAME, AUTH_ERROR_QUERY_VALUE);
	landingUrl.searchParams.set(AUTH_ERROR_INCIDENT_QUERY_NAME, incidentId);
	landingUrl.searchParams.set(AUTH_ERROR_TIMESTAMP_QUERY_NAME, timestamp);
	landingUrl.searchParams.set(
		AUTH_ERROR_SIGNATURE_QUERY_NAME,
		signAuthErrorIncident(incidentId, timestamp, secret.trim())
	);

	return landingUrl.toString();
}

function signaturesMatch(
	actualSignature: string,
	expectedSignature: string
): boolean {
	const actualBuffer = Buffer.from(actualSignature);
	const expectedBuffer = Buffer.from(expectedSignature);
	if (actualBuffer.length !== expectedBuffer.length) {
		return false;
	}

	return timingSafeEqual(actualBuffer, expectedBuffer);
}

function readVerifiedTestAuthError(
	searchParams: URLSearchParams,
	{
		secret,
		now = Date.now()
	}: {
		secret: string;
		now?: number;
	}
): {
	message: string;
	incidentId: string;
} | null {
	if (searchParams.get(AUTH_ERROR_QUERY_NAME) !== AUTH_ERROR_QUERY_VALUE) {
		return null;
	}

	const incidentId = searchParams.get(AUTH_ERROR_INCIDENT_QUERY_NAME);
	const timestamp = searchParams.get(AUTH_ERROR_TIMESTAMP_QUERY_NAME);
	const signature = searchParams.get(AUTH_ERROR_SIGNATURE_QUERY_NAME);
	if (!incidentId || !timestamp || !signature) {
		return null;
	}
	if (
		!AUTH_ERROR_INCIDENT_ID_PATTERN.test(incidentId) ||
		!/^\d+$/.test(timestamp) ||
		!/^[A-Za-z0-9_-]+$/.test(signature)
	) {
		return null;
	}

	const issuedAt = Number(timestamp);
	if (
		!Number.isSafeInteger(issuedAt) ||
		issuedAt - now > AUTH_ERROR_MAX_FUTURE_SKEW_MS ||
		now - issuedAt > AUTH_ERROR_QUERY_TTL_MS
	) {
		return null;
	}

	const normalizedSecret = secret.trim();
	if (normalizedSecret.length === 0) {
		return null;
	}

	const expectedSignature = signAuthErrorIncident(
		incidentId,
		timestamp,
		normalizedSecret
	);
	if (!signaturesMatch(signature, expectedSignature)) {
		return null;
	}

	return {
		message: AUTH_ERROR_MESSAGE,
		incidentId
	};
}

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
	overrides: Partial<Record<string, RouteHandler>> = {},
	responseOrigin?: string
): RouteHandler {
	return (request) => {
		const requestOrigin = `http://${request.headers.host ?? '127.0.0.1'}`;
		const trustedResponseOrigin = responseOrigin ?? requestOrigin;
		const requestUrl = new URL(request.url ?? '/', requestOrigin);
		const pathname = requestUrl.pathname;
		const override = overrides[pathname];
		if (override) {
			return override(request);
		}

		switch (pathname) {
			case '/': {
				const authError = readVerifiedTestAuthError(requestUrl.searchParams, {
					secret: AUTH_ERROR_SIGNING_SECRET
				});
				return {
					statusCode: 200,
					headers: {
						...SECURITY_HEADERS,
						'cache-control': authError
							? PRIVATE_NO_STORE_CACHE_CONTROL
							: PUBLIC_DOCUMENT_CACHE_CONTROL,
						'content-type': 'text/html; charset=utf-8'
					},
					body: authError
						? `<!doctype html><title>ok</title><div>${AUTH_ERROR_MESSAGE}</div><div>${authError.incidentId}</div>`
						: '<!doctype html><title>ok</title>'
				};
			}
			case '/healthz':
				return {
					statusCode: 200,
					headers: {
						...SECURITY_HEADERS,
						'cache-control': HEALTH_CACHE_CONTROL,
						'content-type': 'text/plain; charset=utf-8'
					},
					body: 'ok'
				};
			case '/services':
				return {
					statusCode: 303,
					headers: {
						...SECURITY_HEADERS,
						'cache-control': PRIVATE_NO_STORE_CACHE_CONTROL,
						location: LOCAL_SIGN_IN_PATH
					}
				};
			case '/auth/sign-in': {
				const location = new URL(
					`${TRUSTED_AUTH_ORIGIN}${AUTH_AUTHORIZE_PATH}`
				);
				location.searchParams.set(
					'redirect_uri',
					`${trustedResponseOrigin}${CALLBACK_PATH}`
				);
				location.searchParams.set('screen_hint', 'sign-up');
				return {
					statusCode: 303,
					headers: {
						...SECURITY_HEADERS,
						'cache-control': PRIVATE_NO_STORE_CACHE_CONTROL,
						location: location.toString()
					}
				};
			}
			case '/auth/callback':
				return {
					statusCode: 303,
					headers: {
						...SECURITY_HEADERS,
						'cache-control': PRIVATE_NO_STORE_CACHE_CONTROL,
						location: buildTestAuthErrorLandingRedirectLocation({
							incidentId: AUTH_ERROR_INCIDENT_ID,
							secret: AUTH_ERROR_SIGNING_SECRET,
							origin: trustedResponseOrigin,
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

afterEach(async () => {
	for (const close of Array.from(serverClosers)) {
		await close();
	}
});

describe(
	'deploy health probe script',
	{ skip: !LOOPBACK_LISTEN_SUPPORTED },
	() => {
		it('accepts the expected healthy deployment responses', async () => {
			const server = await startFixtureServer(createHealthyHandler());
			const result = await runDeployHealthScript(server.origin);

			assert.strictEqual(result.exitCode, 0, result.stderr || result.stdout);
			assert.strictEqual(result.signal, null);
		});

		it('accepts a distinct probe origin while validating the canonical deploy origin', async () => {
			const canonicalOrigin = 'http://127.0.0.1:3100';
			const server = await startFixtureServer(
				createHealthyHandler({}, canonicalOrigin)
			);
			const result = await runDeployHealthScript(canonicalOrigin, {
				DEPLOY_PROBE_ORIGIN: server.origin
			});

			assert.strictEqual(result.exitCode, 0, result.stderr || result.stdout);
			assert.strictEqual(result.signal, null);
		});

		it('rejects insecure non-loopback deploy origins before probing', async () => {
			const result = await runDeployHealthScript(
				'http://not-loopback.invalid',
				{
					DEPLOY_HEALTH_CONNECT_TIMEOUT_SECONDS: '1',
					DEPLOY_HEALTH_MAX_TIME_SECONDS: '1'
				}
			);

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
							...SECURITY_HEADERS,
							'cache-control': PRIVATE_NO_STORE_CACHE_CONTROL,
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
							...SECURITY_HEADERS,
							'cache-control': PRIVATE_NO_STORE_CACHE_CONTROL,
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

		it('fails when the callback redirect does not include the auth error redirect contract', async () => {
			const server = await startFixtureServer(
				createHealthyHandler({
					'/auth/callback': () => ({
						statusCode: 303,
						headers: {
							...SECURITY_HEADERS,
							'cache-control': PRIVATE_NO_STORE_CACHE_CONTROL,
							location:
								'/?error=auth&incident=not-an-incident-id&ts=123&sig=abc'
						}
					})
				})
			);
			const result = await runDeployHealthScript(server.origin);

			assert.notStrictEqual(result.exitCode, 0);
			assert.match(
				result.stderr,
				/Expected callback redirect to include the auth error redirect contract/
			);
		});

		it('fails when the callback redirect uses a forged auth error signature', async () => {
			const server = await startFixtureServer(
				createHealthyHandler({
					'/auth/callback': (request) => {
						const requestOrigin = `http://${request.headers.host ?? '127.0.0.1'}`;
						const location = new URL(
							buildTestAuthErrorLandingRedirectLocation({
								incidentId: AUTH_ERROR_INCIDENT_ID,
								secret: AUTH_ERROR_SIGNING_SECRET,
								origin: requestOrigin,
								now: Date.now()
							})
						);
						location.searchParams.set('sig', 'forgedsig');
						return {
							statusCode: 303,
							headers: {
								...SECURITY_HEADERS,
								'cache-control': PRIVATE_NO_STORE_CACHE_CONTROL,
								location: location.toString()
							}
						};
					}
				})
			);
			const result = await runDeployHealthScript(server.origin);

			assert.notStrictEqual(result.exitCode, 0);
			assert.match(
				result.stderr,
				/Expected callback landing page to render the verified auth error banner/
			);
		});

		it('fails when the root document omits a security header', async () => {
			const server = await startFixtureServer(
				createHealthyHandler({
					'/': (request) => {
						const result = createHealthyHandler()(request);
						return {
							...result,
							headers: {
								...result.headers,
								'x-frame-options': 'SAMEORIGIN'
							}
						};
					}
				})
			);
			const result = await runDeployHealthScript(server.origin);

			assert.notStrictEqual(result.exitCode, 0);
			assert.match(
				result.stderr,
				/Expected \/ to include x-frame-options: DENY, received SAMEORIGIN/
			);
		});

		it('fails when the protected redirect becomes publicly cacheable', async () => {
			const server = await startFixtureServer(
				createHealthyHandler({
					'/services': () => ({
						statusCode: 303,
						headers: {
							...SECURITY_HEADERS,
							'cache-control': PUBLIC_DOCUMENT_CACHE_CONTROL,
							location: LOCAL_SIGN_IN_PATH
						}
					})
				})
			);
			const result = await runDeployHealthScript(server.origin);

			assert.notStrictEqual(result.exitCode, 0);
			assert.match(
				result.stderr,
				/Expected \/services to include cache-control: private, no-store, received public, max-age=300, stale-while-revalidate=60/
			);
		});

		it('fails when the auth-error landing page loses its no-store policy', async () => {
			const server = await startFixtureServer(
				createHealthyHandler({
					'/': (request) => {
						const requestOrigin = `http://${request.headers.host ?? '127.0.0.1'}`;
						const requestUrl = new URL(request.url ?? '/', requestOrigin);
						const authError = readVerifiedTestAuthError(
							requestUrl.searchParams,
							{
								secret: AUTH_ERROR_SIGNING_SECRET
							}
						);
						return {
							statusCode: 200,
							headers: {
								...SECURITY_HEADERS,
								'cache-control': PUBLIC_DOCUMENT_CACHE_CONTROL,
								'content-type': 'text/html; charset=utf-8'
							},
							body: authError
								? `<!doctype html><title>ok</title><div>${AUTH_ERROR_MESSAGE}</div><div>${authError.incidentId}</div>`
								: '<!doctype html><title>ok</title>'
						};
					}
				})
			);
			const result = await runDeployHealthScript(server.origin);

			assert.notStrictEqual(result.exitCode, 0);
			assert.match(
				result.stderr,
				/Expected callback landing page to include cache-control: private, no-store, received public, max-age=300, stale-while-revalidate=60/
			);
		});
	}
);
