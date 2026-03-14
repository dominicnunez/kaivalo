import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createSignOutPostHandler } from '../apps/hub/src/lib/auth/sign-out-handler.ts';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { httpGet, startHubPreview } from './helpers/hub-preview.ts';

const AUTHKIT_COOKIE_NAME = '__Host-wos_session';
const previewFixtureImport = new URL(
	'./helpers/hub-preview-fixtures.mts',
	import.meta.url
).href;

/**
 * @param {string} url
 * @param {Record<string, string>} headers
 */
function post(url, headers = {}) {
	return new Promise((resolve, reject) => {
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
			req.destroy(new Error('request timeout'));
		});
		req.end();
	});
}

function getSetCookieHeaders(headers) {
	const values = headers['set-cookie'];
	if (!values) {
		return [];
	}
	return Array.isArray(values) ? values : [values];
}

function getCookiePair(headers, cookieName) {
	const cookieHeader = getSetCookieHeaders(headers).find((value) =>
		value.startsWith(`${cookieName}=`)
	);
	assert.ok(cookieHeader, `Expected ${cookieName} to be set`);
	return cookieHeader.split(';', 1)[0];
}

describe('sign-out handler unit behavior', () => {
	it('allows same-origin requests', async () => {
		const expected = new Response(null, { status: 200 });
		const postHandler = createSignOutPostHandler({
			signOut: async () => expected,
			expectedOrigin: 'https://kaivalo.com'
		});

		const result = await postHandler({
			request: new Request('https://kaivalo.test/auth/sign-out', {
				method: 'POST',
				headers: { origin: 'https://kaivalo.com' }
			}),
			url: new URL('https://kaivalo.test/auth/sign-out')
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
				postHandler({
					request: new Request('https://kaivalo.test/auth/sign-out', {
						method: 'POST',
						headers: { origin: 'https://evil.test' }
					}),
					url: new URL('https://kaivalo.test/auth/sign-out')
				}),
			(caught) => {
				assert.strictEqual(caught.status, 403);
				return true;
			}
		);
	});

	it('accepts configured origins with trailing slash', async () => {
		const expected = new Response(null, { status: 200 });
		const postHandler = createSignOutPostHandler({
			signOut: async () => expected,
			expectedOrigin: 'https://kaivalo.com/'
		});

		const result = await postHandler({
			request: new Request('https://kaivalo.test/auth/sign-out', {
				method: 'POST',
				headers: { origin: 'https://kaivalo.com' }
			}),
			url: new URL('https://kaivalo.test/auth/sign-out')
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

		const result = await postHandler({
			request: new Request('https://kaivalo.test/auth/sign-out', {
				method: 'POST',
				headers: { referer: 'https://kaivalo.com/account' }
			}),
			url: new URL('https://kaivalo.test/auth/sign-out')
		});

		assert.strictEqual(result, expected);
	});

	it('rejects requests when both origin and referer are missing', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		await assert.rejects(
			() =>
				postHandler({
					request: new Request('https://kaivalo.test/auth/sign-out', {
						method: 'POST'
					}),
					url: new URL('https://kaivalo.test/auth/sign-out')
				}),
			(caught) => {
				assert.strictEqual(caught.status, 403);
				return true;
			}
		);
	});

	it('rejects requests with cross-origin referer when origin is absent', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		await assert.rejects(
			() =>
				postHandler({
					request: new Request('https://kaivalo.test/auth/sign-out', {
						method: 'POST',
						headers: { referer: 'https://evil.test/path' }
					}),
					url: new URL('https://kaivalo.test/auth/sign-out')
				}),
			(caught) => {
				assert.strictEqual(caught.status, 403);
				return true;
			}
		);
	});

	it('rejects malformed referer values when origin is absent', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		for (const referer of ['https://', 'not a url', 'https://exa mple.test']) {
			await assert.rejects(
				() =>
					postHandler({
						request: new Request('https://kaivalo.test/auth/sign-out', {
							method: 'POST',
							headers: { referer }
						}),
						url: new URL('https://kaivalo.test/auth/sign-out')
					}),
				(caught) => {
					assert.strictEqual(caught.status, 403);
					return true;
				}
			);
		}
	});

	it('rejects opaque null referer values when origin is absent', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		await assert.rejects(
			() =>
				postHandler({
					request: new Request('https://kaivalo.test/auth/sign-out', {
						method: 'POST',
						headers: { referer: 'null' }
					}),
					url: new URL('https://kaivalo.test/auth/sign-out')
				}),
			(caught) => {
				assert.strictEqual(caught.status, 403);
				return true;
			}
		);
	});

	it('rejects non-post requests even when origin is valid', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		await assert.rejects(
			() =>
				postHandler({
					request: new Request('https://kaivalo.test/auth/sign-out', {
						method: 'GET',
						headers: { origin: 'https://kaivalo.com' }
					}),
					url: new URL('https://kaivalo.test/auth/sign-out')
				}),
			(caught) => {
				assert.strictEqual(caught.status, 405);
				return true;
			}
		);
	});

	it('rejects malformed origin header values', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		await assert.rejects(
			() =>
				postHandler({
					request: new Request('https://kaivalo.test/auth/sign-out', {
						method: 'POST',
						headers: {
							origin: 'https://'
						}
					}),
					url: new URL('https://kaivalo.test/auth/sign-out')
				}),
			(caught) => {
				assert.strictEqual(caught.status, 403);
				return true;
			}
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
				() =>
					postHandler({
						request: new Request('https://kaivalo.test/auth/sign-out', {
							method: 'POST',
							headers: { origin }
						}),
						url: new URL('https://kaivalo.test/auth/sign-out')
					}),
				(caught) => {
					assert.strictEqual(caught.status, 403);
					return true;
				}
			);
		}
	});

	it('rejects opaque null origin header values', async () => {
		const postHandler = createSignOutPostHandler({
			signOut: async () => new Response(null, { status: 303 }),
			expectedOrigin: 'https://kaivalo.com'
		});

		await assert.rejects(
			() =>
				postHandler({
					request: new Request('https://kaivalo.test/auth/sign-out', {
						method: 'POST',
						headers: {
							origin: 'null'
						}
					}),
					url: new URL('https://kaivalo.test/auth/sign-out')
				}),
			(caught) => {
				assert.strictEqual(caught.status, 403);
				return true;
			}
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
				() =>
					postHandler({
						request: new Request('https://kaivalo.test/auth/sign-out', {
							method: 'POST',
							headers: { referer }
						}),
						url: new URL('https://kaivalo.test/auth/sign-out')
					}),
				(caught) => {
					assert.strictEqual(caught.status, 403);
					return true;
				}
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
				postHandler({
					request: new Request('https://kaivalo.test/auth/sign-out', {
						method: 'POST',
						headers: {
							origin: 'https://kaivalo.com',
							referer: 'https://evil.test/account'
						}
					}),
					url: new URL('https://kaivalo.test/auth/sign-out')
				}),
			(caught) => {
				assert.strictEqual(caught.status, 403);
				return true;
			}
		);
	});

	it('normalizes origin hosts before comparing', async () => {
		const expected = new Response(null, { status: 200 });
		const postHandler = createSignOutPostHandler({
			signOut: async () => expected,
			expectedOrigin: 'https://kaivalo.com'
		});

		const result = await postHandler({
			request: new Request('https://kaivalo.test/auth/sign-out', {
				method: 'POST',
				headers: {
					origin: 'https://kaivalo.com:443'
				}
			}),
			url: new URL('https://kaivalo.test/auth/sign-out')
		});

		assert.strictEqual(result, expected);
	});

	it('returns a sanitized 503 with incident reference when upstream signOut fails', async () => {
		/** @type {Array<[string, {
		 * requestId: string
		 * method: string
		 * pathname: string
		 * incidentId: string
		 * errorName: string
		 * errorCode: string
		 * }]>} */
		const logs = [];
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
				postHandler({
					request: new Request('https://kaivalo.test/auth/sign-out', {
						method: 'POST',
						headers: {
							origin: 'https://kaivalo.com',
							'x-request-id': 'request-123'
						}
					}),
					url: new URL('https://kaivalo.test/auth/sign-out')
				}),
			(caught) => {
				assert.ok(isHttpError(caught));
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
		const logs = [];
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
				postHandler({
					request: new Request('https://kaivalo.test/auth/sign-out', {
						method: 'POST',
						headers: {
							origin: 'https://kaivalo.com',
							'x-request-id': 'bad request + trace'
						}
					}),
					url: new URL('https://kaivalo.test/auth/sign-out')
				}),
			(caught) => {
				assert.ok(isHttpError(caught));
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

		const result = await postHandler({
			request: new Request('https://kaivalo.com/auth/sign-out', {
				method: 'POST',
				headers: { origin: 'https://kaivalo.com' }
			}),
			url: new URL('https://kaivalo.com/auth/sign-out')
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
				postHandler({
					request: new Request('https://kaivalo.com/auth/sign-out', {
						method: 'POST',
						headers: { origin: 'https://kaivalo.com' }
					}),
					url: new URL('https://kaivalo.com/auth/sign-out')
				}),
			(caught) => {
				assert.ok(isRedirect(caught));
				assert.strictEqual(caught.status, 302);
				assert.strictEqual(caught.location, '/account?from=sign-out#done');
				return true;
			}
		);
	});

	it('treats non-redirect status objects as unexpected sign-out failures', async () => {
		const logs = [];
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
				postHandler({
					request: new Request('https://kaivalo.test/auth/sign-out', {
						method: 'POST',
						headers: {
							origin: 'https://kaivalo.com',
							accept: 'application/json'
						}
					}),
					url: new URL('https://kaivalo.test/auth/sign-out')
				}),
			(caught) => {
				assert.ok(isHttpError(caught));
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

		const result = await postHandler({
			request: new Request('https://attacker.test/auth/sign-out', {
				method: 'POST',
				headers: { origin: 'https://kaivalo.com' }
			}),
			url: new URL('https://attacker.test/auth/sign-out')
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
				postHandler({
					request: new Request('https://attacker.test/auth/sign-out', {
						method: 'POST',
						headers: { origin: 'https://kaivalo.com' }
					}),
					url: new URL('https://attacker.test/auth/sign-out')
				}),
			(caught) => {
				assert.ok(isRedirect(caught));
				assert.strictEqual(caught.status, 302);
				assert.strictEqual(
					caught.location,
					'https://kaivalo.com/account?from=sign-out#done'
				);
				return true;
			}
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
				postHandler({
					request: new Request('https://attacker.test/auth/sign-out', {
						method: 'POST',
						headers: { origin: 'https://kaivalo.com' }
					}),
					url: new URL('https://attacker.test/auth/sign-out')
				}),
			(caught) => {
				assert.ok(isRedirect(caught));
				assert.strictEqual(caught.status, 302);
				assert.strictEqual(caught.location, redirectLike.location);
				return true;
			}
		);
	});

	it('rejects external redirect-like responses from untrusted origins', async () => {
		const redirectLike = {
			status: 302,
			location: 'https://evil.test/phish'
		};
		const logs = [];
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
				postHandler({
					request: new Request('https://kaivalo.test/auth/sign-out', {
						method: 'POST',
						headers: { origin: 'https://kaivalo.com' }
					}),
					url: new URL('https://kaivalo.test/auth/sign-out')
				}),
			(caught) => {
				assert.ok(isHttpError(caught));
				assert.strictEqual(caught.status, 503);
				return true;
			}
		);
		assert.strictEqual(logs.length, 1);
		assert.strictEqual(
			logs[0][1].errorMessage,
			'Sign-out produced an invalid redirect location'
		);
	});

	it('rejects redirect responses that omit the location header', async () => {
		const logs = [];
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
				postHandler({
					request: new Request('https://kaivalo.test/auth/sign-out', {
						method: 'POST',
						headers: {
							origin: 'https://kaivalo.com',
							accept: 'application/json'
						}
					}),
					url: new URL('https://kaivalo.test/auth/sign-out')
				}),
			(caught) => {
				assert.ok(isHttpError(caught));
				assert.strictEqual(caught.status, 503);
				return true;
			}
		);
		assert.strictEqual(logs.length, 1);
		assert.strictEqual(
			logs[0][1].errorMessage,
			'Sign-out produced a redirect response without a location header'
		);
	});

	it('rejects encoded same-origin separator payloads from signOut handlers', async () => {
		const logs = [];
		const postHandler = createSignOutPostHandler({
			signOut: async () =>
				Response.redirect('https://kaivalo.com/%2F%2Fevil.test/phish', 303),
			expectedOrigin: 'https://kaivalo.com',
			logError: (...args) => logs.push(args)
		});

		await assert.rejects(
			() =>
				postHandler({
					request: new Request('https://kaivalo.test/auth/sign-out', {
						method: 'POST',
						headers: {
							origin: 'https://kaivalo.com',
							accept: 'application/json'
						}
					}),
					url: new URL('https://kaivalo.test/auth/sign-out')
				}),
			(caught) => {
				assert.ok(isHttpError(caught));
				assert.strictEqual(caught.status, 503);
				return true;
			}
		);
		assert.strictEqual(logs.length, 1);
		assert.strictEqual(logs[0][0], 'Sign-out failed');
	});
});

describe('sign-out route integration behavior', () => {
	let preview;

	before(async () => {
		preview = await startHubPreview();
	});

	after(async () => {
		await preview?.stop();
	});

	it('rejects cross-site POST requests', async () => {
		const response = await post(`${preview.baseUrl}/auth/sign-out`, {
			origin: 'https://evil.example',
			'sec-fetch-site': 'cross-site',
			cookie: 'wos_session=test-fixture'
		});

		assert.strictEqual(response.statusCode, 403);
	});

	it('accepts same-origin POST requests at route level', async () => {
		const response = await post(`${preview.baseUrl}/auth/sign-out`, {
			origin: preview.baseUrl,
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
		const response = await post(`${preview.baseUrl}/auth/sign-out`, {
			referer: `${preview.baseUrl}/`,
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
		const response = await post(`${preview.baseUrl}/auth/sign-out`, {
			origin: 'null',
			'sec-fetch-site': 'same-origin',
			cookie: 'wos_session=test-fixture'
		});

		assert.strictEqual(response.statusCode, 403);
	});

	it('rejects route-level POST requests with malformed referer fallback values', async () => {
		for (const referer of ['https://', 'not a url']) {
			const response = await post(`${preview.baseUrl}/auth/sign-out`, {
				referer,
				'sec-fetch-site': 'same-origin'
			});

			assert.strictEqual(response.statusCode, 403);
		}
	});

	it('rejects route-level POST requests with opaque null referer fallback values', async () => {
		const response = await post(`${preview.baseUrl}/auth/sign-out`, {
			referer: 'null',
			'sec-fetch-site': 'same-origin'
		});

		assert.strictEqual(response.statusCode, 403);
	});

	it('rejects route-level POST requests with origin header credentials or a path', async () => {
		for (const origin of [
			`${preview.baseUrl}/account`,
			preview.baseUrl.replace('://', '://user@')
		]) {
			const response = await post(`${preview.baseUrl}/auth/sign-out`, {
				origin,
				'sec-fetch-site': 'same-origin'
			});

			assert.strictEqual(response.statusCode, 403);
		}
	});

	it('rejects route-level POST requests with credentialed referer fallback values', async () => {
		const response = await post(`${preview.baseUrl}/auth/sign-out`, {
			referer: `${preview.baseUrl.replace('://', '://user:pass@')}/account`,
			'sec-fetch-site': 'same-origin'
		});

		assert.strictEqual(response.statusCode, 403);
	});

	it('rejects route-level POST requests when origin and referer disagree', async () => {
		const response = await post(`${preview.baseUrl}/auth/sign-out`, {
			origin: preview.baseUrl,
			referer: 'https://evil.example/account',
			'sec-fetch-site': 'same-origin'
		});

		assert.strictEqual(response.statusCode, 403);
	});

	it('clears a callback-established session before redirecting to the trusted logout origin', async () => {
		const fixturePreview = await startHubPreview({
			shared: false,
			env: {
				HUB_PREVIEW_CALLBACK_FIXTURE_MODE: 'signed-in',
				HUB_PREVIEW_SIGN_OUT_FIXTURE_MODE: 'signed-in'
			},
			imports: [previewFixtureImport]
		});

		try {
			const callbackResponse = await httpGet(
				`${fixturePreview.baseUrl}/auth/callback?code=test-code&state=test-state`,
				{
					accept: 'text/html',
					'sec-fetch-mode': 'navigate'
				}
			);
			assert.strictEqual(callbackResponse.statusCode, 302);
			const sessionCookie = getCookiePair(
				callbackResponse.headers,
				AUTHKIT_COOKIE_NAME
			);

			const response = await post(`${fixturePreview.baseUrl}/auth/sign-out`, {
				origin: fixturePreview.baseUrl,
				'sec-fetch-site': 'same-origin',
				cookie: sessionCookie
			});

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
			const clearedSessionCookie = getCookiePair(
				response.headers,
				AUTHKIT_COOKIE_NAME
			);
			assert.ok(
				getSetCookieHeaders(response.headers).some(
					(cookie) =>
						cookie.startsWith(`${AUTHKIT_COOKIE_NAME}=`) &&
						/max-age=0/i.test(cookie)
				),
				'sign-out should clear the established session cookie'
			);

			const servicesResponse = await httpGet(
				`${fixturePreview.baseUrl}/services`,
				{
					accept: 'text/html',
					cookie: clearedSessionCookie
				}
			);
			assert.strictEqual(servicesResponse.statusCode, 303);
			assert.strictEqual(servicesResponse.headers.location, '/auth/sign-in');
		} finally {
			await fixturePreview.stop();
		}
	});
});
