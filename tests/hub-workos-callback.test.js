import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createAuthCallbackGetHandler } from '../apps/hub/src/lib/auth/callback-handler.js';
import {
	AUTH_ERROR_INCIDENT_QUERY_NAME,
	AUTH_ERROR_QUERY_NAME,
	AUTH_ERROR_QUERY_VALUE,
	AUTH_ERROR_SIGNATURE_QUERY_NAME,
	AUTH_ERROR_TIMESTAMP_QUERY_NAME,
	readVerifiedAuthError
} from '../apps/hub/src/lib/auth/auth-error-query.js';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import {
	httpGet,
	startHubPreview,
	createCallbackFixtureUserHeaders
} from './helpers/hub-preview.js';

const cookiePassword = 'ab'.repeat(32);

function createEvent(headers = {}) {
	return {
		request: new Request('https://kaivalo.test/auth/callback', {
			method: 'GET',
			headers
		}),
		url: new URL('https://kaivalo.test/auth/callback')
	};
}

/**
 * @param {import('node:http').IncomingHttpHeaders} headers
 * @returns {string[]}
 */
function getSetCookieHeaders(headers) {
	const values = headers['set-cookie'];
	if (!values) {
		return [];
	}
	return Array.isArray(values) ? values : [values];
}

/**
 * @param {string[]} setCookieHeaders
 */
function assertHardenedCookies(setCookieHeaders) {
	for (const cookie of setCookieHeaders) {
		const lower = cookie.toLowerCase();
		assert.match(
			lower,
			/\bhttponly\b/,
			`set-cookie must include HttpOnly: ${cookie}`
		);
		assert.match(
			lower,
			/\bsecure\b/,
			`set-cookie must include Secure: ${cookie}`
		);
		assert.match(
			lower,
			/\bsamesite=(strict|lax|none)\b/,
			`set-cookie must include SameSite: ${cookie}`
		);
	}
}

function createCallbackFixtureHeaders(baseUrl, user, returnTo) {
	return {
		...createCallbackFixtureUserHeaders(user),
		'x-kaivalo-test-auth-return-to': `${baseUrl}${returnTo}`
	};
}

describe('WorkOS Auth Callback Route', () => {
	describe('callback handler behavior', () => {
		it('returns upstream handler response on successful callback', async () => {
			const expectedResponse = new Response('ok', { status: 200 });
			const handler = createAuthCallbackGetHandler({
				handleCallback: () => async () => expectedResponse,
				isRedirect: () => false,
				isHttpError: () => false,
				cookiePassword
			});

			const result = await handler(createEvent());
			assert.strictEqual(result, expectedResponse);
		});

		it('normalizes same-origin callback redirects before returning them', async () => {
			const handler = createAuthCallbackGetHandler({
				handleCallback: () => async () =>
					Response.redirect('https://kaivalo.test/account?from=auth#done', 303),
				isRedirect,
				isHttpError,
				cookiePassword
			});

			const result = await handler(createEvent());
			assert.strictEqual(result.status, 303);
			assert.strictEqual(
				result.headers.get('location'),
				'/account?from=auth#done'
			);
		});

		it('rejects callback responses with external redirect locations', async () => {
			const logs = [];
			const handler = createAuthCallbackGetHandler({
				handleCallback: () => async () =>
					Response.redirect('https://evil.test/phish', 303),
				isRedirect,
				isHttpError,
				cookiePassword,
				logError: (...args) => logs.push(args)
			});

			await assert.rejects(
				() => handler(createEvent({ accept: 'application/json' })),
				(caught) => {
					assert.ok(isHttpError(caught));
					assert.strictEqual(caught.status, 503);
					return true;
				}
			);
			assert.strictEqual(logs.length, 1);
			assert.strictEqual(logs[0][0], 'Auth callback failed');
		});

		it('rethrows redirect responses from upstream handler', async () => {
			const redirectErr = { kind: 'redirect' };
			const handler = createAuthCallbackGetHandler({
				handleCallback: () => async () => {
					throw redirectErr;
				},
				isRedirect: (value) => value === redirectErr,
				isHttpError: () => false,
				cookiePassword
			});

			try {
				await handler(createEvent());
				assert.fail('expected handler to rethrow redirect');
			} catch (caught) {
				assert.strictEqual(caught, redirectErr);
			}
		});

		it('normalizes same-origin redirect throws before rethrowing them', async () => {
			const redirectErr = {
				status: 303,
				location: 'https://kaivalo.test/dashboard?welcome=1'
			};
			const handler = createAuthCallbackGetHandler({
				handleCallback: () => async () => {
					throw redirectErr;
				},
				isRedirect: (value) => value === redirectErr,
				isHttpError: () => false,
				cookiePassword
			});

			await assert.rejects(
				() => handler(createEvent()),
				(caught) => {
					assert.ok(isRedirect(caught));
					assert.strictEqual(caught.status, 303);
					assert.strictEqual(caught.location, '/dashboard?welcome=1');
					return true;
				}
			);
		});

		it('rejects redirect throws with external locations', async () => {
			const logs = [];
			const redirectErr = {
				status: 302,
				location: 'https://evil.test/phish'
			};
			const handler = createAuthCallbackGetHandler({
				handleCallback: () => async () => {
					throw redirectErr;
				},
				isRedirect: (value) => value === redirectErr,
				isHttpError: () => false,
				cookiePassword,
				logError: (...args) => logs.push(args)
			});

			await assert.rejects(
				() => handler(createEvent({ accept: 'application/json' })),
				(caught) => {
					assert.ok(isHttpError(caught));
					assert.strictEqual(caught.status, 503);
					return true;
				}
			);
			assert.strictEqual(logs.length, 1);
		});

		it('rethrows http errors from upstream handler', async () => {
			const httpErr = { kind: 'http-error' };
			const handler = createAuthCallbackGetHandler({
				handleCallback: () => async () => {
					throw httpErr;
				},
				isRedirect: () => false,
				isHttpError: (value) => value === httpErr,
				cookiePassword
			});

			try {
				await handler(createEvent());
				assert.fail('expected handler to rethrow http error');
			} catch (caught) {
				assert.strictEqual(caught, httpErr);
			}
		});

		it('logs stable callback failure context and redirects with incident reference for browser requests', async () => {
			const logs = [];
			const handler = createAuthCallbackGetHandler({
				handleCallback: () => async () => {
					throw new Error('upstream failure with token-like-value');
				},
				isRedirect: () => false,
				isHttpError: () => false,
				cookiePassword,
				logError: (...args) => logs.push(args)
			});

			await assert.rejects(
				() =>
					handler(
						createEvent({
							'x-request-id': 'req-123',
							accept: 'text/html'
						})
					),
				(caught) => {
					assert.ok(
						isRedirect(caught),
						'unexpected callback failures should throw redirect responses'
					);
					assert.strictEqual(caught.status, 303);
					const location = new URL(caught.location, 'https://kaivalo.test');
					assert.strictEqual(
						location.searchParams.get(AUTH_ERROR_QUERY_NAME),
						AUTH_ERROR_QUERY_VALUE
					);
					assert.match(
						location.searchParams.get(AUTH_ERROR_INCIDENT_QUERY_NAME) ?? '',
						/^authcb_[0-9a-f-]+$/
					);
					assert.ok(location.searchParams.has(AUTH_ERROR_TIMESTAMP_QUERY_NAME));
					assert.ok(location.searchParams.has(AUTH_ERROR_SIGNATURE_QUERY_NAME));
					assert.deepStrictEqual(
						readVerifiedAuthError(location.searchParams, {
							secret: cookiePassword,
							now:
								Number(
									location.searchParams.get(AUTH_ERROR_TIMESTAMP_QUERY_NAME)
								) + 1
						}),
						{
							message:
								'Sign-in is temporarily unavailable. Please try again shortly.',
							incidentId: location.searchParams.get(
								AUTH_ERROR_INCIDENT_QUERY_NAME
							)
						}
					);
					return true;
				}
			);

			assert.strictEqual(
				logs.length,
				1,
				'should log one sanitized callback error'
			);
			assert.strictEqual(logs[0][0], 'Auth callback failed');
			assert.strictEqual(logs[0][1].requestId, 'req-123');
			assert.strictEqual(logs[0][1].method, 'GET');
			assert.strictEqual(logs[0][1].pathname, '/auth/callback');
			assert.strictEqual(logs[0][1].errorName, 'Error');
			assert.strictEqual(
				logs[0][1].errorCode,
				'AUTH_CALLBACK_UNEXPECTED_FAILURE'
			);
			assert.ok(!('errorUpstreamCode' in logs[0][1]));
			assert.ok(!('errorCauseName' in logs[0][1]));
			assert.ok(!('errorCauseCode' in logs[0][1]));
			assert.ok(!('errorMessage' in logs[0][1]));
			assert.ok(!('errorCause' in logs[0][1]));
			assert.match(logs[0][1].incidentId, /^authcb_[0-9a-f-]+$/);
		});

		it('logs sanitized upstream and cause codes when callback failure includes causal details', async () => {
			const logs = [];
			const handler = createAuthCallbackGetHandler({
				handleCallback: () => async () => {
					const cause = new Error('upstream unavailable');
					cause.code = 'ETIMEDOUT';
					const callbackError = new Error('callback failed');
					callbackError.code = 'WORKOS_UPSTREAM_FAILURE';
					callbackError.cause = cause;
					throw callbackError;
				},
				isRedirect: () => false,
				isHttpError: () => false,
				cookiePassword,
				logError: (...args) => logs.push(args)
			});

			await assert.rejects(() =>
				handler(createEvent({ accept: 'application/json' }))
			);
			assert.strictEqual(logs.length, 1);
			assert.strictEqual(logs[0][1].errorName, 'Error');
			assert.strictEqual(
				logs[0][1].errorUpstreamCode,
				'WORKOS_UPSTREAM_FAILURE'
			);
			assert.strictEqual(logs[0][1].errorCauseName, 'Error');
			assert.strictEqual(logs[0][1].errorCauseCode, 'ETIMEDOUT');
			assert.ok(!('errorMessage' in logs[0][1]));
		});

		it('returns a 503 error with incident reference for non-browser requests', async () => {
			const logs = [];
			const handler = createAuthCallbackGetHandler({
				handleCallback: () => async () => {
					throw new Error('upstream failure with token-like-value');
				},
				isRedirect: () => false,
				isHttpError: () => false,
				cookiePassword,
				logError: (...args) => logs.push(args)
			});

			await assert.rejects(
				() =>
					handler(
						createEvent({
							accept: 'application/json'
						})
					),
				(caught) => {
					assert.ok(
						isHttpError(caught),
						'non-browser callback failures should throw http errors'
					);
					assert.strictEqual(caught.status, 503);
					assert.match(
						caught.body.message,
						/^Auth callback failed\. Reference: authcb_[0-9a-f-]+$/
					);
					return true;
				}
			);

			assert.strictEqual(logs.length, 1);
			assert.match(logs[0][1].incidentId, /^authcb_[0-9a-f-]+$/);
		});

		it('treats document navigation requests as browser redirects without relying on Accept', async () => {
			const handler = createAuthCallbackGetHandler({
				handleCallback: () => async () => {
					throw new Error('upstream failure');
				},
				isRedirect: () => false,
				isHttpError: () => false,
				cookiePassword
			});

			await assert.rejects(
				() =>
					handler(
						createEvent({
							accept: 'application/json',
							'sec-fetch-mode': 'navigate'
						})
					),
				(caught) => {
					assert.ok(isRedirect(caught));
					assert.strictEqual(caught.status, 303);
					return true;
				}
			);
		});

		it('treats document destinations as browser redirects without relying on Accept', async () => {
			const handler = createAuthCallbackGetHandler({
				handleCallback: () => async () => {
					throw new Error('upstream failure');
				},
				isRedirect: () => false,
				isHttpError: () => false,
				cookiePassword
			});

			await assert.rejects(
				() =>
					handler(
						createEvent({
							accept: 'application/json',
							'sec-fetch-dest': 'document'
						})
					),
				(caught) => {
					assert.ok(isRedirect(caught));
					assert.strictEqual(caught.status, 303);
					return true;
				}
			);
		});

		it('handles failures while creating the callback handler factory', async () => {
			const logs = [];
			const handler = createAuthCallbackGetHandler({
				handleCallback: () => {
					throw Object.assign(new Error('factory failed'), {
						code: 'WORKOS_HANDLER_INIT_FAILED'
					});
				},
				isRedirect: () => false,
				isHttpError: () => false,
				cookiePassword,
				logError: (...args) => logs.push(args)
			});

			await assert.rejects(
				() => handler(createEvent({ accept: 'application/json' })),
				(caught) => {
					assert.ok(isHttpError(caught));
					assert.strictEqual(caught.status, 503);
					return true;
				}
			);

			assert.strictEqual(logs.length, 1);
			assert.strictEqual(
				logs[0][1].errorUpstreamCode,
				'WORKOS_HANDLER_INIT_FAILED'
			);
			assert.match(logs[0][1].incidentId, /^authcb_[0-9a-f-]+$/);
		});

		it('normalizes untrusted request id values before logging', async () => {
			const logs = [];
			const handler = createAuthCallbackGetHandler({
				handleCallback: () => async () => {
					throw new Error('upstream failure');
				},
				isRedirect: () => false,
				isHttpError: () => false,
				cookiePassword,
				logError: (...args) => logs.push(args)
			});

			await assert.rejects(() =>
				handler(createEvent({ 'x-request-id': 'bad value/+extra@chars' }))
			);

			assert.strictEqual(logs.length, 1);
			assert.strictEqual(logs[0][1].requestId, 'bad_value__extra_chars');
		});
	});

	describe('callback route integration behavior', () => {
		it('wires GET /auth/callback to callback handling with redirect fallback behavior', async () => {
			const preview = await startHubPreview();
			try {
				const browserResponse = await httpGet(
					`${preview.baseUrl}/auth/callback`,
					{ accept: 'text/html' }
				);
				const apiResponse = await httpGet(`${preview.baseUrl}/auth/callback`, {
					accept: 'application/json'
				});

				assert.strictEqual(browserResponse.statusCode, 303);
				const location = new URL(
					browserResponse.headers.location ?? '/',
					preview.baseUrl
				);
				assert.strictEqual(
					location.searchParams.get(AUTH_ERROR_QUERY_NAME),
					AUTH_ERROR_QUERY_VALUE,
					'route should surface callback incident redirects when upstream callback handling fails'
				);
				assert.match(
					location.searchParams.get(AUTH_ERROR_INCIDENT_QUERY_NAME) ?? '',
					/^authcb_[0-9a-f-]+$/
				);
				assert.ok(location.searchParams.has(AUTH_ERROR_TIMESTAMP_QUERY_NAME));
				assert.ok(location.searchParams.has(AUTH_ERROR_SIGNATURE_QUERY_NAME));
				assert.strictEqual(
					browserResponse.headers['cache-control'],
					'private, no-store'
				);
				const varyHeader = (
					browserResponse.headers['vary'] ?? ''
				).toLowerCase();
				assert.ok(varyHeader.includes('cookie'));
				assert.ok(varyHeader.includes('authorization'));
				assertHardenedCookies(getSetCookieHeaders(browserResponse.headers));
				assert.strictEqual(apiResponse.statusCode, 503);
				assert.match(
					apiResponse.data,
					/Auth callback failed\. Reference: authcb_[0-9a-f-]+/
				);
			} finally {
				await preview.stop();
			}
		});

		it('uses the real WorkOS callback handler contract for code exchanges', async () => {
			const preview = await startHubPreview();
			try {
				const response = await httpGet(
					`${preview.baseUrl}/auth/callback?code=test-code&state=test-state`,
					{ accept: 'text/html' }
				);

				assert.strictEqual(response.statusCode, 303);
				const location = new URL(
					response.headers.location ?? '/',
					preview.baseUrl
				);
				assert.strictEqual(
					location.searchParams.get(AUTH_ERROR_QUERY_NAME),
					AUTH_ERROR_QUERY_VALUE
				);
				assert.match(
					location.searchParams.get(AUTH_ERROR_INCIDENT_QUERY_NAME) ?? '',
					/^authcb_[0-9a-f-]+$/
				);
				assert.strictEqual(
					response.headers['cache-control'],
					'private, no-store'
				);
				const varyHeader = (response.headers['vary'] ?? '').toLowerCase();
				assert.ok(varyHeader.includes('cookie'));
				assert.ok(varyHeader.includes('authorization'));
				assert.deepStrictEqual(
					getSetCookieHeaders(response.headers),
					[],
					'failed upstream exchanges must not mint synthetic session cookies'
				);
			} finally {
				await preview.stop();
			}
		});

		it('establishes a test session and preserves the post-login redirect on success', async () => {
			const preview = await startHubPreview();
			try {
				const response = await httpGet(
					`${preview.baseUrl}/auth/callback?code=fixture-code&state=fixture-state`,
					{
						accept: 'text/html',
						...createCallbackFixtureHeaders(
							preview.baseUrl,
							{
								firstName: 'Kai',
								email: 'kai@example.com',
								profilePictureUrl: 'https://avatars.githubusercontent.com/u/1'
							},
							'/account?from=auth#done'
						)
					}
				);

				assert.strictEqual(response.statusCode, 302);
				assert.strictEqual(
					response.headers.location,
					'/account?from=auth#done'
				);
				assert.strictEqual(
					response.headers['cache-control'],
					'private, no-store'
				);
				const varyHeader = (response.headers['vary'] ?? '').toLowerCase();
				assert.ok(varyHeader.includes('cookie'));
				assert.ok(varyHeader.includes('authorization'));

				const cookies = getSetCookieHeaders(response.headers);
				assert.strictEqual(cookies.length, 1);
				assert.match(cookies[0], /^kaivalo_test_auth_session=/);
				assert.match(cookies[0], /\bPath=\//);
				assert.match(cookies[0], /\bMax-Age=3600\b/);
				assertHardenedCookies(cookies);
			} finally {
				await preview.stop();
			}
		});
	});
});
