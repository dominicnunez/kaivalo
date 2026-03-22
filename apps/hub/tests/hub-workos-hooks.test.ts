import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { error as httpError, redirect } from '@sveltejs/kit';
import {
	assertValidWorkosEnv,
	createSecurityHeadersHandle,
	getProxyTrustConfiguration,
	getValidatedWorkosEnv,
	LOOPBACK_PROXY_TRUST_ERROR_MESSAGE,
	PROXY_HSTS_CONFIGURATION_ERROR_MESSAGE
} from '../src/lib/server/workos-security.ts';
import {
	httpGet,
	startHubPreview
} from '../../../tests/helpers/hub-preview.ts';
import { signInThroughWorkosCallback } from './helpers/workos-auth-flow.ts';
import { assertSessionCookieContract } from './helpers/session-cookie.ts';

const validEnv = {
	WORKOS_CLIENT_ID: 'client_123',
	WORKOS_API_KEY: 'sk_test_123',
	WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
	WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
	AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
	AVATAR_PROXY_SIGNING_SECRET: 'ef'.repeat(32),
	ORIGIN: 'https://kaivalo.test'
};
const PREVIEW_FIXTURE_IMPORT = new URL(
	'./helpers/hub-preview-fixtures.mts',
	import.meta.url
).href;

/**
 * @param {string | null} varyHeader
 * @param {string[]} expectedTokens
 */
function assertVaryIncludes(varyHeader, expectedTokens) {
	assert.notStrictEqual(varyHeader, null);
	const present = new Set(
		(varyHeader ?? '')
			.split(',')
			.map((token) => token.trim().toLowerCase())
			.filter(Boolean)
	);
	for (const token of expectedTokens) {
		assert.ok(
			present.has(token.toLowerCase()),
			`Expected Vary to include ${token}`
		);
	}
}

/**
 * @param {string | null} varyHeader
 * @param {string[]} unexpectedTokens
 */
function assertVaryOmits(varyHeader, unexpectedTokens) {
	const present = new Set(
		(varyHeader ?? '')
			.split(',')
			.map((token) => token.trim().toLowerCase())
			.filter(Boolean)
	);
	for (const token of unexpectedTokens) {
		assert.ok(
			!present.has(token.toLowerCase()),
			`Expected Vary to omit ${token}`
		);
	}
}

describe('WorkOS env validation', () => {
	it('accepts complete valid environment configuration', () => {
		assert.doesNotThrow(() => assertValidWorkosEnv(validEnv));
	});

	it('fails fast when required environment variables are missing', () => {
		assert.throws(
			() => assertValidWorkosEnv({ ...validEnv, WORKOS_API_KEY: '' }),
			/Missing required environment variable: WORKOS_API_KEY/
		);
	});

	it('rejects cookie password values that are not 64 hex characters', () => {
		assert.throws(
			() =>
				assertValidWorkosEnv({
					...validEnv,
					WORKOS_COOKIE_PASSWORD: 'short-value'
				}),
			/WORKOS_COOKIE_PASSWORD must be 64 hex characters/
		);
	});

	it('rejects malformed redirect URIs', () => {
		assert.throws(
			() =>
				assertValidWorkosEnv({ ...validEnv, WORKOS_REDIRECT_URI: 'not-a-url' }),
			/WORKOS_REDIRECT_URI must be a valid absolute callback URL/
		);
	});

	it('rejects non-https redirect URIs for non-local hosts', () => {
		assert.throws(
			() =>
				assertValidWorkosEnv({
					...validEnv,
					WORKOS_REDIRECT_URI: 'http://kaivalo.test/auth/callback'
				}),
			/WORKOS_REDIRECT_URI must use https outside local development/
		);
	});

	it('allows local development redirect URIs over http', () => {
		assert.doesNotThrow(() =>
			assertValidWorkosEnv({
				...validEnv,
				WORKOS_REDIRECT_URI: 'http://localhost:3100/auth/callback',
				ORIGIN: 'http://localhost:3100'
			})
		);
	});

	it('rejects credentialed redirect URIs', () => {
		assert.throws(
			() =>
				assertValidWorkosEnv({
					...validEnv,
					WORKOS_REDIRECT_URI: 'https://user:pass@kaivalo.test/auth/callback'
				}),
			/WORKOS_REDIRECT_URI must be a valid absolute callback URL/
		);
	});

	it('rejects redirect URIs outside the callback route', () => {
		assert.throws(
			() =>
				assertValidWorkosEnv({
					...validEnv,
					WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/other'
				}),
			/WORKOS_REDIRECT_URI must be a valid absolute callback URL/
		);
	});

	it('rejects redirect URIs with query strings or hash fragments', () => {
		assert.throws(
			() =>
				assertValidWorkosEnv({
					...validEnv,
					WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback?next=%2F'
				}),
			/WORKOS_REDIRECT_URI must be a valid absolute callback URL/
		);
		assert.throws(
			() =>
				assertValidWorkosEnv({
					...validEnv,
					WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback#fragment'
				}),
			/WORKOS_REDIRECT_URI must be a valid absolute callback URL/
		);
	});

	it('rejects whitespace-only WorkOS credential values', () => {
		assert.throws(
			() =>
				assertValidWorkosEnv({
					...validEnv,
					WORKOS_CLIENT_ID: '   '
				}),
			/Missing required environment variable: WORKOS_CLIENT_ID/
		);
		assert.throws(
			() =>
				assertValidWorkosEnv({
					...validEnv,
					WORKOS_API_KEY: '\n\t '
				}),
			/Missing required environment variable: WORKOS_API_KEY/
		);
	});

	it('requires ORIGIN for non-local deployments', () => {
		assert.throws(
			() => assertValidWorkosEnv({ ...validEnv, ORIGIN: '' }),
			/Missing required environment variable: ORIGIN/
		);
	});

	it('rejects malformed ORIGIN values', () => {
		assert.throws(
			() => assertValidWorkosEnv({ ...validEnv, ORIGIN: 'not-a-url' }),
			/ORIGIN must be a valid URL origin/
		);
	});

	it('rejects ORIGIN values containing path segments', () => {
		assert.throws(
			() =>
				assertValidWorkosEnv({
					...validEnv,
					ORIGIN: 'https://kaivalo.test/app'
				}),
			/ORIGIN must be a valid URL origin/
		);
	});

	it('rejects non-https ORIGIN values for non-local hosts', () => {
		assert.throws(
			() =>
				assertValidWorkosEnv({ ...validEnv, ORIGIN: 'http://kaivalo.test' }),
			/ORIGIN must use https outside local development/
		);
	});

	it('rejects credentialed ORIGIN values', () => {
		assert.throws(
			() =>
				assertValidWorkosEnv({
					...validEnv,
					ORIGIN: 'https://user:pass@kaivalo.test'
				}),
			/ORIGIN must be a valid URL origin/
		);
	});

	it('normalizes ORIGIN values with trailing slashes', () => {
		const parsed = getValidatedWorkosEnv({
			...validEnv,
			ORIGIN: 'https://kaivalo.test/'
		});
		assert.strictEqual(parsed.origin, 'https://kaivalo.test');
	});

	it('accepts a custom WorkOS api hostname', () => {
		const parsed = getValidatedWorkosEnv({
			...validEnv,
			WORKOS_API_HOSTNAME: 'auth.kaivalo-login.com'
		});
		assert.strictEqual(parsed.apiHostname, 'auth.kaivalo-login.com');
	});

	it('rejects malformed WorkOS api hostnames', () => {
		assert.throws(
			() =>
				getValidatedWorkosEnv({
					...validEnv,
					WORKOS_API_HOSTNAME: 'https://auth.kaivalo-login.com/login'
				}),
			/WORKOS_API_HOSTNAME must be a hostname without protocol, path, credentials, or port/
		);
	});

	it('requires ORIGIN for local deployments outside test environment', () => {
		assert.throws(
			() =>
				assertValidWorkosEnv({
					...validEnv,
					NODE_ENV: 'development',
					WORKOS_REDIRECT_URI: 'http://localhost:3100/auth/callback',
					ORIGIN: ''
				}),
			/Missing required environment variable: ORIGIN/
		);
	});

	it('allows local ORIGIN values over http', () => {
		assert.doesNotThrow(() =>
			assertValidWorkosEnv({
				...validEnv,
				WORKOS_REDIRECT_URI: 'http://localhost:3100/auth/callback',
				ORIGIN: 'http://localhost:3100'
			})
		);
	});

	it('allows local IPv6 loopback redirect URIs over http when hosts match', () => {
		assert.doesNotThrow(() =>
			assertValidWorkosEnv({
				...validEnv,
				WORKOS_REDIRECT_URI: 'http://[::1]:3100/auth/callback',
				ORIGIN: 'http://[::1]:3100'
			})
		);
	});

	it('rejects local loopback origin and redirect URLs when hosts differ', () => {
		assert.throws(
			() =>
				assertValidWorkosEnv({
					...validEnv,
					WORKOS_REDIRECT_URI: 'http://[::1]:3100/auth/callback',
					ORIGIN: 'http://localhost:3100'
				}),
			/ORIGIN must match WORKOS_REDIRECT_URI origin/
		);
	});

	it('rejects non-local origin and redirect hosts that do not match', () => {
		assert.throws(
			() =>
				assertValidWorkosEnv({
					...validEnv,
					WORKOS_REDIRECT_URI: 'https://auth.kaivalo.test/auth/callback',
					ORIGIN: 'https://kaivalo.test'
				}),
			/ORIGIN must match WORKOS_REDIRECT_URI origin/
		);
	});

	it('rejects origin and redirect URLs that differ by port outside local aliasing', () => {
		assert.throws(
			() =>
				assertValidWorkosEnv({
					...validEnv,
					WORKOS_REDIRECT_URI: 'https://kaivalo.test:8443/auth/callback',
					ORIGIN: 'https://kaivalo.test'
				}),
			/ORIGIN must match WORKOS_REDIRECT_URI origin/
		);
	});

	it('rejects local origin and redirect URLs with mismatched ports', () => {
		assert.throws(
			() =>
				assertValidWorkosEnv({
					...validEnv,
					WORKOS_REDIRECT_URI: 'http://127.0.0.1:3101/auth/callback',
					ORIGIN: 'http://localhost:3100'
				}),
			/ORIGIN must match WORKOS_REDIRECT_URI origin/
		);
	});

	it('derives a local ORIGIN in test when one is omitted', () => {
		const parsed = getValidatedWorkosEnv({
			...validEnv,
			NODE_ENV: 'test',
			WORKOS_REDIRECT_URI: 'http://localhost:3100/auth/callback',
			ORIGIN: ''
		});
		assert.strictEqual(parsed.origin, 'http://localhost:3100');
	});
});

describe('proxy trust configuration', () => {
	it('requires trusted proxy ips when forwarded proto trust is enabled', () => {
		assert.throws(
			() =>
				getProxyTrustConfiguration(
					{
						NODE_ENV: 'production',
						TRUST_X_FORWARDED_PROTO: 'true',
						TRUSTED_PROXY_IPS: '  '
					},
					'https://kaivalo.test'
				),
			/TRUSTED_PROXY_IPS must be configured when TRUST_X_FORWARDED_PROTO=true/
		);
	});

	it('fails fast when trusted proxy ip entries are invalid', () => {
		assert.throws(
			() =>
				getProxyTrustConfiguration(
					{
						NODE_ENV: 'production',
						TRUST_X_FORWARDED_PROTO: 'true',
						TRUSTED_PROXY_IPS: '127.0.0.1, not-an-ip'
					},
					'https://kaivalo.test'
				),
			/TRUSTED_PROXY_IPS contains invalid IP address: not-an-ip/
		);
	});

	it('fails fast when production https origin runs without trusted proxy forwarding', () => {
		assert.throws(
			() =>
				getProxyTrustConfiguration(
					{
						NODE_ENV: 'production',
						TRUST_X_FORWARDED_PROTO: 'false',
						TRUSTED_PROXY_IPS: ''
					},
					'https://kaivalo.test'
				),
			new RegExp(
				PROXY_HSTS_CONFIGURATION_ERROR_MESSAGE.replace(
					/[.*+?^${}()|[\]\\]/g,
					'\\$&'
				)
			)
		);
	});

	it('ignores malformed trusted proxy ips when forwarded proto trust is disabled', () => {
		assert.doesNotThrow(() =>
			getProxyTrustConfiguration(
				{
					NODE_ENV: 'production',
					TRUST_X_FORWARDED_PROTO: 'false',
					TRUSTED_PROXY_IPS: 'not-an-ip'
				},
				'http://localhost:5173'
			)
		);
	});

	it('fails fast when production trusted proxies are loopback-only on a non-local origin', () => {
		assert.throws(
			() =>
				getProxyTrustConfiguration(
					{
						NODE_ENV: 'production',
						TRUST_X_FORWARDED_PROTO: 'true',
						TRUSTED_PROXY_IPS: '127.0.0.1,::1'
					},
					'https://kaivalo.test'
				),
			new RegExp(
				LOOPBACK_PROXY_TRUST_ERROR_MESSAGE.replace(
					/[.*+?^${}()|[\]\\]/g,
					'\\$&'
				)
			)
		);
	});

	it('allows direct local http development origins without proxy trust', () => {
		const config = getProxyTrustConfiguration(
			{
				NODE_ENV: 'development',
				TRUST_X_FORWARDED_PROTO: 'false',
				TRUSTED_PROXY_IPS: ''
			},
			'http://localhost:5173'
		);
		assert.strictEqual(config.trustForwardedProto, false);
		assert.deepStrictEqual(config.trustedProxyIps, []);
	});
});

describe('Security header handle behavior', () => {
	it('adds security headers to the resolved response', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {},
			resolve: async () => new Response('ok', { status: 200 })
		});

		assert.strictEqual(response.headers.get('Strict-Transport-Security'), null);
		assert.strictEqual(response.headers.get('X-Frame-Options'), 'DENY');
		assert.strictEqual(
			response.headers.get('X-Content-Type-Options'),
			'nosniff'
		);
		assert.strictEqual(
			response.headers.get('Referrer-Policy'),
			'strict-origin-when-cross-origin'
		);
		assert.strictEqual(
			response.headers.get('Permissions-Policy'),
			'camera=(), microphone=(), geolocation=()'
		);
		assert.strictEqual(response.headers.get('Content-Security-Policy'), null);
	});

	it('rethrows unexpected downstream failures for centralized handling', async () => {
		const handle = createSecurityHeadersHandle();
		await assert.rejects(
			() =>
				handle({
					event: {
						request: new Request('https://kaivalo.test/auth/callback', {
							method: 'GET',
							headers: { authorization: 'Bearer fixture-token' }
						}),
						url: new URL('https://kaivalo.test/auth/callback')
					},
					resolve: async () => {
						throw new Error('boom');
					}
				}),
			(error) => {
				assert.strictEqual(error?.message, 'boom');
				return true;
			}
		);
	});

	it('rethrows redirect responses from downstream handlers', async () => {
		const handle = createSecurityHeadersHandle();
		await assert.rejects(
			() =>
				handle({
					event: {
						request: new Request('https://kaivalo.test/', { method: 'GET' }),
						url: new URL('https://kaivalo.test/')
					},
					resolve: async () => redirect(303, '/sign-in')
				}),
			(error) => {
				assert.strictEqual(error?.status, 303);
				assert.strictEqual(error?.location, '/sign-in');
				return true;
			}
		);
	});

	it('rethrows http errors from downstream handlers', async () => {
		const handle = createSecurityHeadersHandle();
		await assert.rejects(
			() =>
				handle({
					event: {
						request: new Request('https://kaivalo.test/', { method: 'GET' }),
						url: new URL('https://kaivalo.test/')
					},
					resolve: async () => {
						httpError(404, 'Not Found');
					}
				}),
			(error) => {
				assert.strictEqual(error?.status, 404);
				return true;
			}
		);
	});

	it('adds HSTS for secure requests', async () => {
		const handle = createSecurityHeadersHandle();
		const secureResponse = await handle({
			event: {
				request: new Request('https://kaivalo.test/', { method: 'GET' }),
				url: new URL('https://kaivalo.test/')
			},
			resolve: async () => new Response('ok', { status: 200 })
		});

		assert.strictEqual(
			secureResponse.headers.get('Strict-Transport-Security'),
			'max-age=63072000; includeSubDomains'
		);
	});

	it('only trusts x-forwarded-proto from configured proxy IPs', async () => {
		const defaultHandle = createSecurityHeadersHandle();
		const trustedProxyHandle = createSecurityHeadersHandle({
			trustForwardedProto: true,
			trustedProxyIps: ['127.0.0.1']
		});
		const spoofedResponse = await defaultHandle({
			event: {
				request: new Request('http://kaivalo.test/', {
					method: 'GET',
					headers: { 'x-forwarded-proto': 'https' }
				}),
				url: new URL('http://kaivalo.test/'),
				getClientAddress: () => '127.0.0.1'
			},
			resolve: async () => new Response('ok', { status: 200 })
		});
		const untrustedProxyResponse = await trustedProxyHandle({
			event: {
				request: new Request('http://kaivalo.test/', {
					method: 'GET',
					headers: { 'x-forwarded-proto': 'https' }
				}),
				url: new URL('http://kaivalo.test/'),
				getClientAddress: () => '203.0.113.15'
			},
			resolve: async () => new Response('ok', { status: 200 })
		});
		const proxiedResponse = await trustedProxyHandle({
			event: {
				request: new Request('http://kaivalo.test/', {
					method: 'GET',
					headers: { 'x-forwarded-proto': 'https' }
				}),
				url: new URL('http://kaivalo.test/'),
				getClientAddress: () => '::ffff:127.0.0.1'
			},
			resolve: async () => new Response('ok', { status: 200 })
		});

		assert.strictEqual(
			spoofedResponse.headers.get('Strict-Transport-Security'),
			null
		);
		assert.strictEqual(
			untrustedProxyResponse.headers.get('Strict-Transport-Security'),
			null
		);
		assert.strictEqual(
			proxiedResponse.headers.get('Strict-Transport-Security'),
			'max-age=63072000; includeSubDomains'
		);
	});

	it('trusts x-forwarded-proto when adapter-node resolves the real client address', async () => {
		const trustedProxyHandle = createSecurityHeadersHandle({
			trustForwardedProto: true,
			trustedProxyIps: ['203.0.113.10']
		});
		const proxiedResponse = await trustedProxyHandle({
			event: {
				request: new Request('http://kaivalo.test/', {
					method: 'GET',
					headers: {
						'x-forwarded-for': '198.51.100.24',
						'x-forwarded-proto': 'https'
					}
				}),
				url: new URL('http://kaivalo.test/'),
				getClientAddress: () => '198.51.100.24',
				platform: {
					req: {
						socket: {
							remoteAddress: '203.0.113.10'
						}
					}
				}
			},
			resolve: async () => new Response('ok', { status: 200 })
		});

		assert.strictEqual(
			proxiedResponse.headers.get('Strict-Transport-Security'),
			'max-age=63072000; includeSubDomains'
		);
	});

	it('treats equivalent IPv6 proxy address forms as trusted', async () => {
		const trustedProxyHandle = createSecurityHeadersHandle({
			trustForwardedProto: true,
			trustedProxyIps: ['2001:0db8:0000:0000:0000:ff00:0042:8329']
		});
		const proxiedResponse = await trustedProxyHandle({
			event: {
				request: new Request('http://kaivalo.test/', {
					method: 'GET',
					headers: { 'x-forwarded-proto': 'https' }
				}),
				url: new URL('http://kaivalo.test/'),
				getClientAddress: () => '2001:db8::ff00:42:8329'
			},
			resolve: async () => new Response('ok', { status: 200 })
		});

		assert.strictEqual(
			proxiedResponse.headers.get('Strict-Transport-Security'),
			'max-age=63072000; includeSubDomains'
		);
	});

	it('applies reusable caching for public HTML documents', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {
				request: new Request('https://kaivalo.test/', { method: 'GET' }),
				url: new URL('https://kaivalo.test/')
			},
			resolve: async () =>
				new Response('<!doctype html>', {
					status: 200,
					headers: { 'Content-Type': 'text/html; charset=utf-8' }
				})
		});

		assert.strictEqual(
			response.headers.get('Cache-Control'),
			'public, max-age=300, stale-while-revalidate=60'
		);
		assertVaryOmits(response.headers.get('Vary'), ['Cookie']);
		assertVaryOmits(response.headers.get('Vary'), ['Authorization']);
	});

	it('keeps HTML responses no-store for auth paths and auth-cookie-bearing requests', async () => {
		const handle = createSecurityHeadersHandle();
		const authRouteResponse = await handle({
			event: {
				request: new Request('https://kaivalo.test/auth/sign-out', {
					method: 'GET'
				}),
				url: new URL('https://kaivalo.test/auth/sign-out')
			},
			resolve: async () =>
				new Response('<!doctype html>', {
					status: 200,
					headers: { 'Content-Type': 'text/html; charset=utf-8' }
				})
		});
		const cookieResponse = await handle({
			event: {
				request: new Request('https://kaivalo.test/', {
					method: 'GET',
					headers: { cookie: 'wos_session=value' }
				}),
				url: new URL('https://kaivalo.test/')
			},
			resolve: async () =>
				new Response('<!doctype html>', {
					status: 200,
					headers: { 'Content-Type': 'text/html; charset=utf-8' }
				})
		});

		assert.strictEqual(
			authRouteResponse.headers.get('Cache-Control'),
			'private, no-store'
		);
		assert.strictEqual(
			cookieResponse.headers.get('Cache-Control'),
			'private, no-store'
		);
		assertVaryIncludes(authRouteResponse.headers.get('Vary'), [
			'Cookie',
			'Authorization'
		]);
		assertVaryIncludes(cookieResponse.headers.get('Vary'), ['Cookie']);
		assertVaryOmits(cookieResponse.headers.get('Vary'), ['Authorization']);
	});

	it('does not force no-store caching for non-auth cookie-bearing html responses', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {
				request: new Request('https://kaivalo.test/', {
					method: 'GET',
					headers: { cookie: 'consent=true; analytics_id=abc123' }
				}),
				url: new URL('https://kaivalo.test/')
			},
			resolve: async () =>
				new Response('<!doctype html>', {
					status: 200,
					headers: { 'Content-Type': 'text/html; charset=utf-8' }
				})
		});

		assert.strictEqual(
			response.headers.get('Cache-Control'),
			'public, max-age=300, stale-while-revalidate=60'
		);
		assertVaryOmits(response.headers.get('Vary'), ['Cookie']);
		assertVaryOmits(response.headers.get('Vary'), ['Authorization']);
	});

	it('keeps authorization-bearing documents no-store without varying on cookies', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {
				request: new Request('https://kaivalo.test/private', {
					method: 'GET',
					headers: { authorization: 'Bearer fixture-token' }
				}),
				url: new URL('https://kaivalo.test/private')
			},
			resolve: async () =>
				new Response('<!doctype html>', {
					status: 200,
					headers: { 'Content-Type': 'text/html; charset=utf-8' }
				})
		});

		assert.strictEqual(
			response.headers.get('Cache-Control'),
			'private, no-store'
		);
		assertVaryIncludes(response.headers.get('Vary'), ['Authorization']);
		assertVaryOmits(response.headers.get('Vary'), ['Cookie']);
	});

	it('forces no-store for HTML responses that set cookies', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {
				request: new Request('https://kaivalo.test/', { method: 'GET' }),
				url: new URL('https://kaivalo.test/')
			},
			resolve: async () =>
				new Response('<!doctype html>', {
					status: 200,
					headers: {
						'Content-Type': 'text/html; charset=utf-8',
						'Set-Cookie': 'session=secret; Path=/; HttpOnly; Secure'
					}
				})
		});

		assert.strictEqual(
			response.headers.get('Cache-Control'),
			'private, no-store'
		);
		assertVaryIncludes(response.headers.get('Vary'), ['Cookie']);
		assertVaryOmits(response.headers.get('Vary'), ['Authorization']);
	});

	it('does not overwrite explicit cache-control headers', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {
				request: new Request('https://kaivalo.test/', { method: 'GET' }),
				url: new URL('https://kaivalo.test/')
			},
			resolve: async () =>
				new Response('<!doctype html>', {
					status: 200,
					headers: {
						'Content-Type': 'text/html; charset=utf-8',
						'Cache-Control': 'public, max-age=60'
					}
				})
		});

		assert.strictEqual(
			response.headers.get('Cache-Control'),
			'public, max-age=60'
		);
	});

	it('overrides explicit public cache-control for sensitive auth-cookie-bearing document requests', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {
				request: new Request('https://kaivalo.test/', {
					method: 'GET',
					headers: { cookie: 'wos_session=value' }
				}),
				url: new URL('https://kaivalo.test/')
			},
			resolve: async () =>
				new Response('<!doctype html>', {
					status: 200,
					headers: {
						'Content-Type': 'text/html; charset=utf-8',
						'Cache-Control': 'public, max-age=60'
					}
				})
		});

		assert.strictEqual(
			response.headers.get('Cache-Control'),
			'private, no-store'
		);
		assertVaryIncludes(response.headers.get('Vary'), ['Cookie']);
		assertVaryOmits(response.headers.get('Vary'), ['Authorization']);
	});

	it('overrides explicit public cache-control for sensitive auth-route document requests', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {
				request: new Request('https://kaivalo.test/auth/callback', {
					method: 'GET',
					headers: { authorization: 'Bearer fixture-token' }
				}),
				url: new URL('https://kaivalo.test/auth/callback')
			},
			resolve: async () =>
				new Response('<!doctype html>', {
					status: 200,
					headers: {
						'Content-Type': 'text/html; charset=utf-8',
						'Cache-Control': 'public, max-age=120'
					}
				})
		});

		assert.strictEqual(
			response.headers.get('Cache-Control'),
			'private, no-store'
		);
		assertVaryIncludes(response.headers.get('Vary'), [
			'Cookie',
			'Authorization'
		]);
	});

	it('does not force no-store caching on non-sensitive non-document responses', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {
				request: new Request('https://kaivalo.test/app.css', { method: 'GET' }),
				url: new URL('https://kaivalo.test/app.css')
			},
			resolve: async () =>
				new Response('body { color: red; }', {
					status: 200,
					headers: { 'Content-Type': 'text/css; charset=utf-8' }
				})
		});

		assert.strictEqual(response.headers.get('Cache-Control'), null);
	});

	it('does not apply static cache policy to dynamic json from asset-like paths', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {
				request: new Request('https://kaivalo.test/favicon.svg', {
					method: 'GET'
				}),
				url: new URL('https://kaivalo.test/favicon.svg')
			},
			resolve: async () =>
				new Response('{"ok":true}', {
					status: 200,
					headers: { 'Content-Type': 'application/json; charset=utf-8' }
				})
		});

		assert.strictEqual(response.headers.get('Cache-Control'), null);
		assert.strictEqual(response.headers.get('X-Frame-Options'), 'DENY');
		assert.strictEqual(
			response.headers.get('X-Content-Type-Options'),
			'nosniff'
		);
	});

	it('forces no-store caching on authorization-bearing non-document responses', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {
				request: new Request('https://kaivalo.test/api/private', {
					method: 'GET',
					headers: { authorization: 'Bearer fixture-token' }
				}),
				url: new URL('https://kaivalo.test/api/private')
			},
			resolve: async () =>
				new Response('{"ok":true}', {
					status: 200,
					headers: { 'Content-Type': 'application/json; charset=utf-8' }
				})
		});

		assert.strictEqual(
			response.headers.get('Cache-Control'),
			'private, no-store'
		);
		assertVaryIncludes(response.headers.get('Vary'), ['Authorization']);
		assertVaryOmits(response.headers.get('Vary'), ['Cookie']);
	});

	it('forces no-store caching on auth-cookie-bearing non-document responses', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {
				request: new Request('https://kaivalo.test/api/private', {
					method: 'GET',
					headers: { cookie: 'wos_session=value' }
				}),
				url: new URL('https://kaivalo.test/api/private')
			},
			resolve: async () =>
				new Response('{"ok":true}', {
					status: 200,
					headers: { 'Content-Type': 'application/json; charset=utf-8' }
				})
		});

		assert.strictEqual(
			response.headers.get('Cache-Control'),
			'private, no-store'
		);
		assertVaryIncludes(response.headers.get('Vary'), ['Cookie']);
		assertVaryOmits(response.headers.get('Vary'), ['Authorization']);
	});

	it('preserves avatar cache headers for auth-cookie-bearing avatar responses', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {
				request: new Request('https://kaivalo.test/avatar?u=signed', {
					method: 'GET',
					headers: { cookie: '__Host-wos_session=value' }
				}),
				url: new URL('https://kaivalo.test/avatar?u=signed')
			},
			resolve: async () =>
				new Response('avatar-binary', {
					status: 200,
					headers: {
						'Content-Type': 'image/png',
						'Cache-Control':
							'private, max-age=300, stale-while-revalidate=86400',
						ETag: '"avatar-1"'
					}
				})
		});

		assert.strictEqual(
			response.headers.get('Cache-Control'),
			'private, max-age=300, stale-while-revalidate=86400'
		);
		assert.strictEqual(response.headers.get('ETag'), '"avatar-1"');
		assertVaryOmits(response.headers.get('Vary'), ['Cookie']);
		assertVaryOmits(response.headers.get('Vary'), ['Authorization']);
	});

	it('forces no-store caching on non-document auth-route responses', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {
				request: new Request('https://kaivalo.test/auth/callback', {
					method: 'GET'
				}),
				url: new URL('https://kaivalo.test/auth/callback')
			},
			resolve: async () =>
				new Response('moved', {
					status: 303,
					headers: {
						'Content-Type': 'text/plain; charset=utf-8',
						Location: '/'
					}
				})
		});

		assert.strictEqual(
			response.headers.get('Cache-Control'),
			'private, no-store'
		);
		assertVaryIncludes(response.headers.get('Vary'), [
			'Cookie',
			'Authorization'
		]);
	});

	it('forces no-store caching on non-document responses that set cookies', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {
				request: new Request('https://kaivalo.test/api/session', {
					method: 'POST'
				}),
				url: new URL('https://kaivalo.test/api/session')
			},
			resolve: async () =>
				new Response('created', {
					status: 201,
					headers: {
						'Content-Type': 'application/json; charset=utf-8',
						'Set-Cookie': 'session=secret; Path=/; HttpOnly; Secure'
					}
				})
		});

		assert.strictEqual(
			response.headers.get('Cache-Control'),
			'private, no-store'
		);
		assertVaryIncludes(response.headers.get('Vary'), ['Cookie']);
		assertVaryOmits(response.headers.get('Vary'), ['Authorization']);
	});
});

describe('Security headers on preview responses', () => {
	let preview;

	before(async () => {
		preview = await startHubPreview();
	});

	after(async () => {
		await preview?.stop();
	});

	it('serves hook-managed security and caching headers on real responses', async () => {
		const homepage = await httpGet(preview.baseUrl);

		assert.strictEqual(homepage.statusCode, 200);
		assert.strictEqual(
			homepage.headers['strict-transport-security'],
			undefined
		);
		assert.strictEqual(homepage.headers['x-frame-options'], 'DENY');
		assert.strictEqual(homepage.headers['x-content-type-options'], 'nosniff');
		assert.strictEqual(
			homepage.headers['referrer-policy'],
			'strict-origin-when-cross-origin'
		);
		assert.strictEqual(
			homepage.headers['cache-control'],
			'public, max-age=300, stale-while-revalidate=60'
		);
		assertVaryOmits(homepage.headers['vary'] ?? null, ['Cookie']);
		assertVaryOmits(homepage.headers['vary'] ?? null, ['Authorization']);
	});

	it('keeps unrelated-cookie homepage responses publicly cacheable', async () => {
		const homepage = await httpGet(preview.baseUrl, {
			cookie: 'consent=true; analytics_id=abc123'
		});

		assert.strictEqual(homepage.statusCode, 200);
		assert.strictEqual(
			homepage.headers['cache-control'],
			'public, max-age=300, stale-while-revalidate=60'
		);
		assertVaryOmits(homepage.headers['vary'] ?? null, ['Cookie']);
		assertVaryOmits(homepage.headers['vary'] ?? null, ['Authorization']);
	});

	it('keeps authenticated homepage responses private and cookie-varying', async () => {
		const fixturePreview = await startHubPreview({
			env: {
				HUB_PREVIEW_CALLBACK_FIXTURE_MODE: 'signed-in'
			},
			imports: [PREVIEW_FIXTURE_IMPORT]
		});

		try {
			const { callbackResponse, cookieJar } = await signInThroughWorkosCallback(
				fixturePreview.baseUrl
			);

			assert.strictEqual(callbackResponse.statusCode, 302);
			assertSessionCookieContract(callbackResponse.headers);

			const homepage = await httpGet(fixturePreview.baseUrl, {
				headers: {
					accept: 'text/html'
				},
				cookieJar
			});

			assert.strictEqual(homepage.statusCode, 200);
			assert.strictEqual(
				homepage.headers['cache-control'],
				'private, no-store'
			);
			assertVaryIncludes(homepage.headers['vary'] ?? null, ['Cookie']);
			assertVaryOmits(homepage.headers['vary'] ?? null, ['Authorization']);
		} finally {
			await fixturePreview.stop();
		}
	});

	it('serves framework-managed content security policy on real responses', async () => {
		const homepage = await httpGet(preview.baseUrl);
		const contentSecurityPolicy =
			homepage.headers['content-security-policy'] ?? '';

		assert.strictEqual(homepage.statusCode, 200);
		assert.ok(contentSecurityPolicy.includes("default-src 'self'"));
		assert.ok(contentSecurityPolicy.includes("script-src 'self'"));
		assert.ok(contentSecurityPolicy.includes("style-src 'self'"));
		assert.ok(contentSecurityPolicy.includes("font-src 'self'"));
		assert.ok(contentSecurityPolicy.includes("img-src 'self' data:"));
		assert.ok(!contentSecurityPolicy.includes('https://images.workoscdn.com'));
		assert.ok(
			!contentSecurityPolicy.includes('https://avatars.githubusercontent.com')
		);
		assert.ok(
			!contentSecurityPolicy.includes('https://*.googleusercontent.com')
		);
		assert.ok(contentSecurityPolicy.includes("object-src 'none'"));
		assert.ok(contentSecurityPolicy.includes("frame-ancestors 'none'"));
		assert.ok(!contentSecurityPolicy.includes("style-src 'unsafe-inline'"));
		assert.ok(!contentSecurityPolicy.includes('api.fontshare.com'));
		assert.ok(!contentSecurityPolicy.includes('cdn.fontshare.com'));
		assert.ok(!contentSecurityPolicy.includes('img-src https:'));
	});

	it('keeps anonymous services redirects out of shared caches', async () => {
		const response = await httpGet(`${preview.baseUrl}/services`);

		assert.strictEqual(response.statusCode, 303);
		assert.strictEqual(response.headers.location, '/auth/sign-in');
		assert.strictEqual(response.headers['cache-control'], 'private, no-store');
		assertVaryOmits(response.headers['vary'] ?? null, ['Authorization']);
	});

	it('keeps security and no-store headers on framework-generated 500 pages', async () => {
		const failureResponse = await httpGet(
			`${preview.baseUrl}/__tests__/unexpected-error`,
			{
				'x-kaivalo-test-unhandled-error': '1'
			}
		);
		const contentSecurityPolicy =
			failureResponse.headers['content-security-policy'] ?? '';

		assert.strictEqual(failureResponse.statusCode, 500);
		assert.strictEqual(
			failureResponse.headers['cache-control'],
			'private, no-store'
		);
		assert.strictEqual(failureResponse.headers['x-frame-options'], 'DENY');
		assert.strictEqual(
			failureResponse.headers['x-content-type-options'],
			'nosniff'
		);
		assert.strictEqual(
			failureResponse.headers['referrer-policy'],
			'strict-origin-when-cross-origin'
		);
		assert.ok(contentSecurityPolicy.includes("default-src 'self'"));
		assert.ok(contentSecurityPolicy.includes("frame-ancestors 'none'"));
	});
});
