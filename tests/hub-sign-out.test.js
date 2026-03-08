import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createSignOutPostHandler } from '../apps/hub/src/lib/auth/sign-out-handler.js';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { startHubPreview } from './helpers/hub-preview.js';

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

describe('sign-out handler unit behavior', () => {
	it('allows same-origin requests', async () => {
		const expected = new Response(null, { status: 303 });
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
		const expected = new Response(null, { status: 303 });
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
		const expected = new Response(null, { status: 303 });
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

	it('normalizes origin hosts before comparing', async () => {
		const expected = new Response(null, { status: 303 });
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

	it('rethrows redirect-like responses from signOut handlers', async () => {
		const redirectLike = {
			status: 302,
			location: '/'
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
					request: new Request('https://kaivalo.test/auth/sign-out', {
						method: 'POST',
						headers: { origin: 'https://kaivalo.com' }
					}),
					url: new URL('https://kaivalo.test/auth/sign-out')
				}),
			(caught) => {
				assert.ok(isRedirect(caught));
				assert.strictEqual(caught.status, 302);
				assert.strictEqual(caught.location, '/');
				return true;
			}
		);
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
			cookie: 'wos-session=test-fixture'
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
			cookie: 'wos-session=test-fixture'
		});

		assert.strictEqual(response.statusCode, 403);
	});
});
