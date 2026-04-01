import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createSignOutPostHandler } from '../src/lib/auth/sign-out-handler.ts';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { httpGet, httpPost, startHubPreview } from './helpers/hub-preview.ts';
import { createRequestEvent } from './helpers/request-event.ts';
import { signInThroughWorkosCallback } from './helpers/workos-auth-flow.ts';
import {
	assertClearedSessionCookieContract,
	assertSessionCookieContract,
	getSetCookieHeaders
} from './helpers/session-cookie.ts';

const AUTHKIT_COOKIE_NAME = '__Host-wos_session';
const previewFixtureImport = new URL(
	'./helpers/hub-preview-fixtures.mts',
	import.meta.url
).href;
type SignOutHandler = ReturnType<typeof createSignOutPostHandler>;
type SignOutHandlerOptions = Parameters<typeof createSignOutPostHandler>[0];
type SignOutLogEntry = Parameters<
	NonNullable<SignOutHandlerOptions['logError']>
>;
type PreviewHandle = Awaited<ReturnType<typeof startHubPreview>>;
type SignOutRequestOptions = {
	headers?: HeadersInit;
	requestUrl?: string;
	method?: string;
};

function createEvent(
	headers: HeadersInit = {},
	requestUrl = 'https://kaivalo.test/auth/sign-out',
	method = 'POST'
) {
	return createRequestEvent({
		requestUrl,
		method,
		headers
	});
}

function invokePostHandler(
	postHandler: SignOutHandler,
	{ headers = {}, requestUrl, method }: SignOutRequestOptions = {}
) {
	return postHandler(createEvent(headers, requestUrl, method));
}

function createLogEntries(): SignOutLogEntry[] {
	return [];
}

function requirePreview(preview: PreviewHandle | undefined): PreviewHandle {
	assert.ok(preview);
	return preview;
}

function expectHttpErrorStatus(caught: unknown, status: number): boolean {
	assert.ok(isHttpError(caught));
	if (!isHttpError(caught)) {
		return false;
	}

	assert.strictEqual(caught.status, status);
	return true;
}

function expectRedirectStatus(
	caught: unknown,
	status: number,
	location?: string
): boolean {
	assert.ok(isRedirect(caught));
	if (!isRedirect(caught)) {
		return false;
	}

	assert.strictEqual(caught.status, status);
	if (location !== undefined) {
		assert.strictEqual(caught.location, location);
	}
	return true;
}

describe('sign-out handler unit behavior', () => {
	it('allows same-origin requests', async () => {
		const expected = new Response(null, { status: 200 });
		const postHandler = createSignOutPostHandler({
			signOut: async () => expected,
			expectedOrigin: 'https://kaivalo.com'
		});

		const result = await invokePostHandler(postHandler, {
			headers: { origin: 'https://kaivalo.com' }
		});

		assert.strictEqual(result, expected);
	});

	it('rejects cross-origin requests', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		await assert.rejects(
			() =>
				invokePostHandler(postHandler, {
					headers: { origin: 'https://evil.test' }
				}),
			(caught: unknown) => expectHttpErrorStatus(caught, 403)
		);
	});

	it('accepts configured origins with trailing slash', async () => {
		const expected = new Response(null, { status: 200 });
		const postHandler = createSignOutPostHandler({
			signOut: async () => expected,
			expectedOrigin: 'https://kaivalo.com/'
		});

		const result = await invokePostHandler(postHandler, {
			headers: { origin: 'https://kaivalo.com' }
		});

		assert.strictEqual(result, expected);
	});

	it('rejects invalid configured origin values at creation time', () => {
		assert.throws(
			() =>
				createSignOutPostHandler({
					signOut: async () => new Response(null, { status: 303 }),
					expectedOrigin: 'https://user:pass@kaivalo.com'
				}),
			/expectedOrigin must be a valid URL origin/
		);
	});

	it('accepts same-origin requests when origin is absent but referer is same-origin', async () => {
		const expected = new Response(null, { status: 200 });
		const postHandler = createSignOutPostHandler({
			signOut: async () => expected,
			expectedOrigin: 'https://kaivalo.com'
		});

		const result = await invokePostHandler(postHandler, {
			headers: { referer: 'https://kaivalo.com/account' }
		});

		assert.strictEqual(result, expected);
	});

	it('rejects requests when both origin and referer are missing', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		await assert.rejects(
			() => invokePostHandler(postHandler),
			(caught: unknown) => expectHttpErrorStatus(caught, 403)
		);
	});

	it('rejects requests with cross-origin referer when origin is absent', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		await assert.rejects(
			() =>
				invokePostHandler(postHandler, {
					headers: { referer: 'https://evil.test/path' }
				}),
			(caught: unknown) => expectHttpErrorStatus(caught, 403)
		);
	});

	it('rejects malformed referer values when origin is absent', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		for (const referer of ['https://', 'not a url', 'https://exa mple.test']) {
			await assert.rejects(
				() => invokePostHandler(postHandler, { headers: { referer } }),
				(caught: unknown) => expectHttpErrorStatus(caught, 403)
			);
		}
	});

	it('rejects opaque null referer values when origin is absent', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		await assert.rejects(
			() => invokePostHandler(postHandler, { headers: { referer: 'null' } }),
			(caught: unknown) => expectHttpErrorStatus(caught, 403)
		);
	});

	it('rejects non-post requests even when origin is valid', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		await assert.rejects(
			() =>
				invokePostHandler(postHandler, {
					method: 'GET',
					headers: { origin: 'https://kaivalo.com' }
				}),
			(caught: unknown) => expectHttpErrorStatus(caught, 405)
		);
	});

	it('rejects malformed origin header values', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		await assert.rejects(
			() => invokePostHandler(postHandler, { headers: { origin: 'https://' } }),
			(caught: unknown) => expectHttpErrorStatus(caught, 403)
		);
	});

	it('rejects origin header values with credentials or a path', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		for (const origin of [
			'https://user@kaivalo.com',
			'https://kaivalo.com/path',
			'https://user@kaivalo.com/path'
		]) {
			await assert.rejects(
				() => invokePostHandler(postHandler, { headers: { origin } }),
				(caught: unknown) => expectHttpErrorStatus(caught, 403)
			);
		}
	});

	it('rejects opaque null origin header values', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		await assert.rejects(
			() => invokePostHandler(postHandler, { headers: { origin: 'null' } }),
			(caught: unknown) => expectHttpErrorStatus(caught, 403)
		);
	});

	it('rejects referer fallback values with embedded credentials', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		for (const referer of [
			'https://user@kaivalo.com/account',
			'https://user:pass@kaivalo.com/account'
		]) {
			await assert.rejects(
				() => invokePostHandler(postHandler, { headers: { referer } }),
				(caught: unknown) => expectHttpErrorStatus(caught, 403)
			);
		}
	});

	it('rejects requests when origin and referer disagree', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		await assert.rejects(
			() =>
				invokePostHandler(postHandler, {
					headers: {
						origin: 'https://kaivalo.com',
						referer: 'https://evil.test/account'
					}
				}),
			(caught: unknown) => expectHttpErrorStatus(caught, 403)
		);
	});

	it('normalizes origin hosts before comparing', async () => {
		const expected = new Response(null, { status: 200 });
		const postHandler = createSignOutPostHandler({
			signOut: async () => expected,
			expectedOrigin: 'https://kaivalo.com'
		});

		const result = await invokePostHandler(postHandler, {
			headers: {
				origin: 'https://kaivalo.com:443'
			}
		});

		assert.strictEqual(result, expected);
	});

	it('returns a sanitized 503 with incident reference when upstream signOut fails', async () => {
		const logs = createLogEntries();
		const postHandler = createSignOutPostHandler({
			signOut: async () => {
				throw new Error('token expired: secret should not leak');
			},
			expectedOrigin: 'https://kaivalo.com',
			logError: (message, context) => {
				logs.push([message, context]);
			}
		});

		await assert.rejects(
			() =>
				invokePostHandler(postHandler, {
					headers: {
						origin: 'https://kaivalo.com',
						'x-request-id': 'request-123'
					}
				}),
			(caught: unknown) => {
				assert.ok(isHttpError(caught));
				if (!isHttpError(caught)) {
					return false;
				}

				assert.strictEqual(caught.status, 503);
				assert.match(
					caught.body.message,
					/^Sign-out failed\. Reference: authso_/
				);
				return true;
			}
		);

		assert.strictEqual(logs.length, 1);
		assert.strictEqual(logs[0][0], 'Sign-out failed');
		assert.strictEqual(logs[0][1].requestId, 'request-123');
		assert.strictEqual(logs[0][1].method, 'POST');
		assert.strictEqual(logs[0][1].pathname, '/auth/sign-out');
		assert.strictEqual(logs[0][1].errorName, 'Error');
		assert.strictEqual(
			logs[0][1].errorCode,
			'AUTH_SIGN_OUT_UNEXPECTED_FAILURE'
		);
		assert.ok(
			!('errorStack' in logs[0][1]),
			'stack traces must not be logged for sign-out failures'
		);
		const serializedLog = JSON.stringify(logs[0]);
		assert.ok(
			!serializedLog.includes('secret should not leak'),
			'log context should not contain upstream secret-bearing error content'
		);
		assert.ok(
			!('errorCauseName' in logs[0][1]),
			'cause details should only be logged when an upstream cause exists'
		);
		assert.match(logs[0][1].incidentId, /^authso_/);
	});

	it('logs upstream and cause codes for unexpected sign-out failures', async () => {
		const logs = createLogEntries();
		const postHandler = createSignOutPostHandler({
			signOut: async () => {
				const cause = Object.assign(new Error('upstream detail'), {
					code: 'SESSION_DELETE_TIMEOUT'
				});
				throw Object.assign(new Error('sign-out failed'), {
					code: 'WORKOS_SIGNOUT_FAILED',
					cause
				});
			},
			expectedOrigin: 'https://kaivalo.com',
			includeMessageInLogs: true,
			logError: (...args) => logs.push(args)
		});

		await assert.rejects(
			() =>
				invokePostHandler(postHandler, {
					headers: {
						origin: 'https://kaivalo.com',
						'x-request-id': 'bad request + trace'
					}
				}),
			(caught: unknown) => {
				assert.ok(isHttpError(caught));
				if (!isHttpError(caught)) {
					return false;
				}

				assert.strictEqual(caught.status, 503);
				assert.match(
					caught.body.message,
					/^Sign-out failed\. Reference: authso_/
				);
				return true;
			}
		);

		assert.strictEqual(logs.length, 1);
		assert.strictEqual(logs[0][0], 'Sign-out failed');
		assert.strictEqual(
			logs[0][1].errorCode,
			'AUTH_SIGN_OUT_UNEXPECTED_FAILURE'
		);
		assert.strictEqual(logs[0][1].errorMessage, 'sign-out failed');
		assert.strictEqual(logs[0][1].errorCauseMessage, 'upstream detail');
		assert.strictEqual(logs[0][1].errorUpstreamCode, 'WORKOS_SIGNOUT_FAILED');
		assert.strictEqual(logs[0][1].errorCauseCode, 'SESSION_DELETE_TIMEOUT');
		assert.strictEqual(logs[0][1].errorCauseName, 'Error');
		assert.strictEqual(logs[0][1].errorName, 'Error');
		assert.strictEqual(logs[0][1].pathname, '/auth/sign-out');
		assert.strictEqual(logs[0][1].requestId, 'bad_request___trace');
	});

	it('normalizes same-origin redirect-like responses from signOut handlers', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () =>
				Response.redirect(
					'https://kaivalo.com/account?from=sign-out#done',
					302
				),
			expectedOrigin: 'https://kaivalo.com'
		});

		const result = await invokePostHandler(postHandler, {
			requestUrl: 'https://kaivalo.com/auth/sign-out',
			headers: { origin: 'https://kaivalo.com' }
		});

		assert.strictEqual(result.status, 302);
		assert.strictEqual(
			result.headers.get('location'),
			'/account?from=sign-out#done'
		);
	});

	it('normalizes same-origin redirect-like throws from signOut handlers', async () => {
		const redirectLike = {
			status: 302,
			location: 'https://kaivalo.com/account?from=sign-out#done'
		};
		const postHandler = createSignOutPostHandler({
			signOut: async () => {
				throw redirectLike;
			},
			expectedOrigin: 'https://kaivalo.com'
		});

		await assert.rejects(
			() =>
				invokePostHandler(postHandler, {
					requestUrl: 'https://kaivalo.com/auth/sign-out',
					headers: { origin: 'https://kaivalo.com' }
				}),
			(caught: unknown) =>
				expectRedirectStatus(caught, 302, '/account?from=sign-out#done')
		);
	});

	it('treats non-redirect status objects as unexpected sign-out failures', async () => {
		const logs = createLogEntries();
		const postHandler = createSignOutPostHandler({
			signOut: async () => {
				throw {
					status: 200,
					location: 'https://kaivalo.com/account?from=sign-out#done'
				};
			},
			expectedOrigin: 'https://kaivalo.com',
			logError: (...args) => logs.push(args)
		});

		await assert.rejects(
			() =>
				invokePostHandler(postHandler, {
					headers: {
						origin: 'https://kaivalo.com',
						accept: 'application/json'
					}
				}),
			(caught: unknown) => {
				assert.ok(isHttpError(caught));
				if (!isHttpError(caught)) {
					return false;
				}

				assert.strictEqual(caught.status, 503);
				assert.match(
					caught.body.message,
					/^Sign-out failed\. Reference: authso_[0-9a-f-]+$/
				);
				return true;
			}
		);

		assert.strictEqual(logs.length, 1);
		assert.strictEqual(logs[0][0], 'Sign-out failed');
		assert.match(logs[0][1].incidentId, /^authso_[0-9a-f-]+$/);
	});

	it('preserves same-origin redirect-like responses as absolute URLs when the request host is poisoned', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () =>
				Response.redirect(
					'https://kaivalo.com/account?from=sign-out#done',
					302
				),
			expectedOrigin: 'https://kaivalo.com'
		});

		const result = await invokePostHandler(postHandler, {
			requestUrl: 'https://attacker.test/auth/sign-out',
			headers: { origin: 'https://kaivalo.com' }
		});

		assert.strictEqual(result.status, 302);
		assert.strictEqual(
			result.headers.get('location'),
			'https://kaivalo.com/account?from=sign-out#done'
		);
	});

	it('preserves same-origin redirect-like throws as absolute URLs when the request host is poisoned', async () => {
		const redirectLike = {
			status: 302,
			location: 'https://kaivalo.com/account?from=sign-out#done'
		};
		const postHandler = createSignOutPostHandler({
			signOut: async () => {
				throw redirectLike;
			},
			expectedOrigin: 'https://kaivalo.com'
		});

		await assert.rejects(
			() =>
				invokePostHandler(postHandler, {
					requestUrl: 'https://attacker.test/auth/sign-out',
					headers: { origin: 'https://kaivalo.com' }
				}),
			(caught: unknown) =>
				expectRedirectStatus(
					caught,
					302,
					'https://kaivalo.com/account?from=sign-out#done'
				)
		);
	});

	it('allows external WorkOS logout redirects from signOut handlers', async () => {
		const redirectLike = {
			status: 302,
			location:
				'https://api.workos.com/user_management/sessions/logout?session_id=session_123&return_to=https%3A%2F%2Fkaivalo.test'
		};
		const postHandler = createSignOutPostHandler({
			signOut: async () => {
				throw redirectLike;
			},
			expectedOrigin: 'https://kaivalo.com',
			allowedRedirectOrigins: ['https://api.workos.com']
		});

		await assert.rejects(
			() =>
				invokePostHandler(postHandler, {
					requestUrl: 'https://attacker.test/auth/sign-out',
					headers: { origin: 'https://kaivalo.com' }
				}),
			(caught: unknown) =>
				expectRedirectStatus(caught, 302, redirectLike.location)
		);
	});

	it('rejects external redirect-like responses from untrusted origins', async () => {
		const redirectLike = {
			status: 302,
			location: 'https://evil.test/phish'
		};
		const logs = createLogEntries();
		const postHandler = createSignOutPostHandler({
			signOut: async () => {
				throw redirectLike;
			},
			expectedOrigin: 'https://kaivalo.com',
			includeMessageInLogs: true,
			logError: (...args) => logs.push(args)
		});

		await assert.rejects(
			() =>
				invokePostHandler(postHandler, {
					headers: { origin: 'https://kaivalo.com' }
				}),
			(caught: unknown) => expectHttpErrorStatus(caught, 503)
		);
		assert.strictEqual(logs.length, 1);
		assert.strictEqual(
			logs[0][1].errorMessage,
			'Sign-out produced an invalid redirect location'
		);
	});

	it('rejects redirect responses that omit the location header', async () => {
		const logs = createLogEntries();
		const postHandler = createSignOutPostHandler({
			signOut: async () =>
				new Response(null, {
					status: 302
				}),
			expectedOrigin: 'https://kaivalo.com',
			includeMessageInLogs: true,
			logError: (...args) => logs.push(args)
		});

		await assert.rejects(
			() =>
				invokePostHandler(postHandler, {
					headers: {
						origin: 'https://kaivalo.com',
						accept: 'application/json'
					}
				}),
			(caught: unknown) => expectHttpErrorStatus(caught, 503)
		);
		assert.strictEqual(logs.length, 1);
		assert.strictEqual(
			logs[0][1].errorMessage,
			'Sign-out produced a redirect response without a location header'
		);
	});

	it('rejects encoded same-origin separator payloads from signOut handlers', async () => {
		const logs = createLogEntries();
		const postHandler = createSignOutPostHandler({
			signOut: async () =>
				Response.redirect('https://kaivalo.com/%2F%2Fevil.test/phish', 303),
			expectedOrigin: 'https://kaivalo.com',
			logError: (...args) => logs.push(args)
		});

		await assert.rejects(
			() =>
				invokePostHandler(postHandler, {
					headers: {
						origin: 'https://kaivalo.com',
						accept: 'application/json'
					}
				}),
			(caught: unknown) => expectHttpErrorStatus(caught, 503)
		);
		assert.strictEqual(logs.length, 1);
		assert.strictEqual(logs[0][0], 'Sign-out failed');
	});
});

describe('sign-out route integration behavior', () => {
	let preview: PreviewHandle | undefined;

	before(async () => {
		preview = await startHubPreview();
	});

	after(async () => {
		await preview?.stop();
	});

	it('rejects cross-site POST requests', async () => {
		const response = await httpPost(
			`${requirePreview(preview).baseUrl}/auth/sign-out`,
			{
				origin: 'https://evil.example',
				'sec-fetch-site': 'cross-site',
				cookie: 'wos_session=test-fixture'
			}
		);

		assert.strictEqual(response.statusCode, 403);
	});

	it('accepts same-origin POST requests at route level', async () => {
		const readyPreview = requirePreview(preview);
		const response = await httpPost(`${readyPreview.baseUrl}/auth/sign-out`, {
			origin: readyPreview.baseUrl,
			'sec-fetch-site': 'same-origin'
		});

		assert.strictEqual(
			response.statusCode,
			302,
			`expected 302 redirect, received ${response.statusCode}`
		);
		assert.strictEqual(
			response.headers.location,
			'/',
			'sign-out should redirect to the homepage'
		);
		assert.strictEqual(response.headers['cache-control'], 'private, no-store');
		const varyHeader = (response.headers['vary'] ?? '').toLowerCase();
		assert.ok(varyHeader.includes('cookie'));
		assert.ok(varyHeader.includes('authorization'));
		assert.deepStrictEqual(
			getSetCookieHeaders(response.headers),
			[],
			'sign-out without a valid AuthKit session should not fabricate logout cookies'
		);
	});

	it('accepts route-level POST requests without origin when same-origin referer is present', async () => {
		const readyPreview = requirePreview(preview);
		const response = await httpPost(`${readyPreview.baseUrl}/auth/sign-out`, {
			referer: `${readyPreview.baseUrl}/`,
			'sec-fetch-site': 'same-origin'
		});

		assert.strictEqual(
			response.statusCode,
			302,
			`expected 302 redirect, received ${response.statusCode}`
		);
		assert.strictEqual(
			response.headers.location,
			'/',
			'sign-out should redirect to the homepage'
		);
		assert.strictEqual(response.headers['cache-control'], 'private, no-store');
		const varyHeader = (response.headers['vary'] ?? '').toLowerCase();
		assert.ok(varyHeader.includes('cookie'));
		assert.ok(varyHeader.includes('authorization'));
		assert.deepStrictEqual(
			getSetCookieHeaders(response.headers),
			[],
			'sign-out without a valid AuthKit session should not fabricate logout cookies'
		);
	});

	it('rejects route-level POST requests with an opaque null origin', async () => {
		const response = await httpPost(
			`${requirePreview(preview).baseUrl}/auth/sign-out`,
			{
				origin: 'null',
				'sec-fetch-site': 'same-origin',
				cookie: 'wos_session=test-fixture'
			}
		);

		assert.strictEqual(response.statusCode, 403);
	});

	it('rejects route-level POST requests with malformed referer fallback values', async () => {
		const readyPreview = requirePreview(preview);
		for (const referer of ['https://', 'not a url']) {
			const response = await httpPost(`${readyPreview.baseUrl}/auth/sign-out`, {
				referer,
				'sec-fetch-site': 'same-origin'
			});

			assert.strictEqual(response.statusCode, 403);
		}
	});

	it('rejects route-level POST requests with opaque null referer fallback values', async () => {
		const response = await httpPost(
			`${requirePreview(preview).baseUrl}/auth/sign-out`,
			{
				referer: 'null',
				'sec-fetch-site': 'same-origin'
			}
		);

		assert.strictEqual(response.statusCode, 403);
	});

	it('rejects route-level POST requests with origin header credentials or a path', async () => {
		const readyPreview = requirePreview(preview);
		for (const origin of [
			`${readyPreview.baseUrl}/account`,
			readyPreview.baseUrl.replace('://', '://user@')
		]) {
			const response = await httpPost(`${readyPreview.baseUrl}/auth/sign-out`, {
				origin,
				'sec-fetch-site': 'same-origin'
			});

			assert.strictEqual(response.statusCode, 403);
		}
	});

	it('rejects route-level POST requests with credentialed referer fallback values', async () => {
		const readyPreview = requirePreview(preview);
		const response = await httpPost(`${readyPreview.baseUrl}/auth/sign-out`, {
			referer: `${readyPreview.baseUrl.replace('://', '://user:pass@')}/account`,
			'sec-fetch-site': 'same-origin'
		});

		assert.strictEqual(response.statusCode, 403);
	});

	it('rejects route-level POST requests when origin and referer disagree', async () => {
		const readyPreview = requirePreview(preview);
		const response = await httpPost(`${readyPreview.baseUrl}/auth/sign-out`, {
			origin: readyPreview.baseUrl,
			referer: 'https://evil.example/account',
			'sec-fetch-site': 'same-origin'
		});

		assert.strictEqual(response.statusCode, 403);
	});

	it('clears a callback-established session before redirecting to the trusted logout origin', async () => {
		const fixturePreview = await startHubPreview({
			shared: false,
			env: {
				HUB_PREVIEW_CALLBACK_FIXTURE_MODE: 'signed-in'
			},
			imports: [previewFixtureImport]
		});

		try {
			const { callbackResponse, cookieJar } = await signInThroughWorkosCallback(
				fixturePreview.baseUrl
			);
			assert.strictEqual(callbackResponse.statusCode, 302);
			assertSessionCookieContract(callbackResponse.headers, {
				cookieName: AUTHKIT_COOKIE_NAME
			});

			const response = await httpPost(
				`${fixturePreview.baseUrl}/auth/sign-out`,
				{
					headers: {
						origin: fixturePreview.baseUrl,
						'sec-fetch-site': 'same-origin'
					},
					cookieJar
				}
			);

			assert.strictEqual(response.statusCode, 302);
			const logoutLocation = new URL(
				String(response.headers.location),
				fixturePreview.baseUrl
			);
			assert.strictEqual(logoutLocation.origin, 'https://api.workos.com');
			assert.strictEqual(
				logoutLocation.pathname,
				'/user_management/sessions/logout'
			);
			assert.strictEqual(
				logoutLocation.searchParams.get('session_id'),
				'preview-session'
			);
			assert.strictEqual(
				logoutLocation.searchParams.get('return_to'),
				fixturePreview.baseUrl
			);
			assertClearedSessionCookieContract(response.headers, AUTHKIT_COOKIE_NAME);

			const servicesResponse = await httpGet(
				`${fixturePreview.baseUrl}/services`,
				{
					headers: {
						accept: 'text/html'
					},
					cookieJar
				}
			);
			assert.strictEqual(servicesResponse.statusCode, 303);
			assert.strictEqual(servicesResponse.headers.location, '/auth/sign-in');
		} finally {
			await fixturePreview.stop();
		}
	});
});
