import { describe, expect, it } from 'vitest';
import { AUTHKIT_COOKIE_NAME } from './authkit-config.ts';
import {
	createSecurityHeadersHandle,
	getStaticAssetCacheControl,
	getStaticAssetCacheControlForResponse,
	getTrustedForwardedProto,
	getValidatedWorkosEnv,
	shouldApplyStaticAssetHeaders
} from './workos-security.ts';

const validLocalEnv = {
	WORKOS_CLIENT_ID: 'client_fixture',
	WORKOS_API_KEY: 'sk_fixture',
	WORKOS_REDIRECT_URI: 'http://localhost:3100/auth/callback',
	WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
	AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
	AVATAR_PROXY_SIGNING_SECRET: 'ef'.repeat(32),
	ORIGIN: 'http://localhost:3100'
};

describe('static asset security policy', () => {
	it('marks immutable app bundles as immutable cached static assets', () => {
		const pathname = '/_app/immutable/chunks/index.abc123.js';
		expect(getStaticAssetCacheControl(pathname)).toBe(
			'public, max-age=31536000, immutable'
		);
		expect(shouldApplyStaticAssetHeaders(pathname)).toBe(true);
	});

	it('applies static policy to known root assets', () => {
		const pathname = '/favicon.svg';
		expect(getStaticAssetCacheControl(pathname)).toBe(
			'public, max-age=86400, stale-while-revalidate=600'
		);
		expect(shouldApplyStaticAssetHeaders(pathname)).toBe(true);
	});

	it('applies static policy to font assets with explicit cache control', () => {
		const pathname = '/fonts/clash-display-400.woff2';
		expect(getStaticAssetCacheControl(pathname)).toBe(
			'public, max-age=604800, stale-while-revalidate=86400'
		);
		expect(shouldApplyStaticAssetHeaders(pathname)).toBe(true);
	});

	it('does not treat dynamic routes as static assets', () => {
		const pathname = '/auth/callback';
		expect(getStaticAssetCacheControl(pathname)).toBeNull();
		expect(shouldApplyStaticAssetHeaders(pathname)).toBe(false);
	});

	it('does not classify extension-shaped dynamic routes as static assets', () => {
		const pathname = '/health.json';
		expect(getStaticAssetCacheControl(pathname)).toBeNull();
		expect(shouldApplyStaticAssetHeaders(pathname)).toBe(false);
	});

	it('only applies static caching when the response looks like an asset', () => {
		expect(
			getStaticAssetCacheControlForResponse({
				pathname: '/favicon.svg',
				statusCode: 200,
				contentType: 'image/svg+xml; charset=utf-8'
			})
		).toBe('public, max-age=86400, stale-while-revalidate=600');
		expect(
			getStaticAssetCacheControlForResponse({
				pathname: '/favicon.svg',
				statusCode: 200,
				contentType: 'application/json; charset=utf-8'
			})
		).toBeNull();
		expect(
			getStaticAssetCacheControlForResponse({
				pathname: '/favicon.svg',
				statusCode: 404,
				contentType: 'image/svg+xml'
			})
		).toBeNull();
		expect(
			getStaticAssetCacheControlForResponse({
				pathname: '/_app/immutable/chunks/index.abc123.js',
				statusCode: 304,
				contentType: null
			})
		).toBe('public, max-age=31536000, immutable');
		expect(
			getStaticAssetCacheControlForResponse({
				pathname: '/favicon.ico',
				statusCode: 200,
				contentType: ''
			})
		).toBe('public, max-age=86400, stale-while-revalidate=600');
		expect(
			getStaticAssetCacheControlForResponse({
				pathname: '/health.json',
				statusCode: 200,
				contentType: ''
			})
		).toBeNull();
	});

	it('keeps verified static assets cacheable even when auth cookies are present', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {
				request: new Request(
					'https://kaivalo.test/_app/immutable/entry/app.js',
					{
						headers: {
							cookie: `${AUTHKIT_COOKIE_NAME}=fixture`
						}
					}
				),
				url: new URL('https://kaivalo.test/_app/immutable/entry/app.js')
			} as never,
			resolve: async () =>
				new Response('console.log("fixture")', {
					headers: {
						'Content-Type': 'application/javascript; charset=utf-8'
					}
				})
		});

		expect(response.headers.get('cache-control')).toBe(
			'public, max-age=31536000, immutable'
		);
		expect(response.headers.get('vary')).toBeNull();
	});

	it('preserves signed avatar cache headers when auth cookies are present', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {
				request: new Request('https://kaivalo.test/avatar?sig=fixture', {
					headers: {
						cookie: `${AUTHKIT_COOKIE_NAME}=fixture`
					}
				}),
				url: new URL('https://kaivalo.test/avatar?sig=fixture')
			} as never,
			resolve: async () =>
				new Response('avatar-bytes', {
					headers: {
						'Content-Type': 'image/png',
						'Cache-Control':
							'private, max-age=300, stale-while-revalidate=86400',
						ETag: '"avatar-fixture"'
					}
				})
		});

		expect(response.headers.get('cache-control')).toBe(
			'private, max-age=300, stale-while-revalidate=86400'
		);
		expect(response.headers.get('etag')).toBe('"avatar-fixture"');
		expect(response.headers.get('vary')).toBeNull();
	});
});

describe('workos environment protocols', () => {
	it('accepts http loopback redirect URIs across the full ipv4 loopback range', () => {
		expect(() =>
			getValidatedWorkosEnv({
				...validLocalEnv,
				WORKOS_REDIRECT_URI: 'http://127.0.0.2:3100/auth/callback',
				ORIGIN: 'http://127.0.0.2:3100'
			})
		).not.toThrow();
	});

	it('rejects non-http redirect URI schemes for localhost', () => {
		expect(() =>
			getValidatedWorkosEnv({
				...validLocalEnv,
				WORKOS_REDIRECT_URI: 'ftp://localhost:3100/auth/callback'
			})
		).toThrow(/WORKOS_REDIRECT_URI must use http or https/);
	});

	it('rejects non-http ORIGIN schemes for localhost', () => {
		expect(() =>
			getValidatedWorkosEnv({
				...validLocalEnv,
				ORIGIN: 'ftp://localhost:3100'
			})
		).toThrow(/ORIGIN must use http or https/);
	});

	it('accepts an optional WorkOS api hostname', () => {
		expect(
			getValidatedWorkosEnv({
				...validLocalEnv,
				WORKOS_API_HOSTNAME: 'auth.kaivalo-login.test'
			}).apiHostname
		).toBe('auth.kaivalo-login.test');
	});

	it('requires a dedicated auth error signing secret', () => {
		expect(() =>
			getValidatedWorkosEnv({
				...validLocalEnv,
				AUTH_ERROR_SIGNING_SECRET: ''
			})
		).toThrow(
			/Missing required environment variable: AUTH_ERROR_SIGNING_SECRET/
		);
	});

	it('rejects malformed auth error signing secrets', () => {
		expect(() =>
			getValidatedWorkosEnv({
				...validLocalEnv,
				AUTH_ERROR_SIGNING_SECRET: 'not-hex'
			})
		).toThrow(/AUTH_ERROR_SIGNING_SECRET must be 64 hex characters/);
	});

	it('requires a dedicated avatar proxy signing secret', () => {
		expect(() =>
			getValidatedWorkosEnv({
				...validLocalEnv,
				AVATAR_PROXY_SIGNING_SECRET: ''
			})
		).toThrow(
			/Missing required environment variable: AVATAR_PROXY_SIGNING_SECRET/
		);
	});

	it('rejects malformed avatar proxy signing secrets', () => {
		expect(() =>
			getValidatedWorkosEnv({
				...validLocalEnv,
				AVATAR_PROXY_SIGNING_SECRET: 'not-hex'
			})
		).toThrow(/AVATAR_PROXY_SIGNING_SECRET must be 64 hex characters/);
	});

	it('rejects malformed WorkOS api hostnames', () => {
		const invalidHostnames = [
			'https://auth.kaivalo-login.test/path',
			'.kaivalo-login.com',
			'..kaivalo-login.com',
			'-bad.example',
			'bad-.example',
			'auth.kaivalo-login.test:443'
		];

		for (const hostname of invalidHostnames) {
			expect(() =>
				getValidatedWorkosEnv({
					...validLocalEnv,
					WORKOS_API_HOSTNAME: hostname
				})
			).toThrow(
				/WORKOS_API_HOSTNAME must be a hostname without protocol, path, credentials, or port/
			);
		}
	});

	it('allows DEV_AUTH_BYPASS for loopback-only development origins', () => {
		expect(() =>
			getValidatedWorkosEnv({
				...validLocalEnv,
				NODE_ENV: 'development',
				DEV_AUTH_BYPASS: 'true',
				ORIGIN: 'http://127.0.0.1:3100',
				WORKOS_REDIRECT_URI: 'http://localhost:3100/auth/callback'
			})
		).not.toThrow();
	});

	it('rejects DEV_AUTH_BYPASS outside development', () => {
		expect(() =>
			getValidatedWorkosEnv({
				...validLocalEnv,
				NODE_ENV: 'production',
				DEV_AUTH_BYPASS: 'true'
			})
		).toThrow(
			/DEV_AUTH_BYPASS requires NODE_ENV=development with loopback-only ORIGIN and WORKOS_REDIRECT_URI callback URL/
		);
	});

	it.each([
		[
			'non-loopback origin',
			{
				NODE_ENV: 'development',
				DEV_AUTH_BYPASS: 'true',
				ORIGIN: 'https://kaivalo.test',
				WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback'
			}
		],
		[
			'non-loopback callback',
			{
				NODE_ENV: 'development',
				DEV_AUTH_BYPASS: 'true',
				ORIGIN: 'http://localhost:3100',
				WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback'
			}
		],
		[
			'missing origin outside test mode',
			{
				NODE_ENV: 'development',
				DEV_AUTH_BYPASS: 'true',
				ORIGIN: ''
			}
		]
	])('rejects DEV_AUTH_BYPASS with %s', (_label, envOverrides) => {
		expect(() =>
			getValidatedWorkosEnv({
				...validLocalEnv,
				...envOverrides
			})
		).toThrow(
			/DEV_AUTH_BYPASS requires NODE_ENV=development with loopback-only ORIGIN and WORKOS_REDIRECT_URI callback URL/
		);
	});
});

describe('trusted forwarded proto parsing', () => {
	it('uses the proxy-controlled proto nearest the app for comma-separated values', () => {
		expect(getTrustedForwardedProto('https, http')).toBe('http');
		expect(getTrustedForwardedProto('http, https')).toBe('https');
	});

	it('rejects unsupported trusted proxy proto values', () => {
		expect(getTrustedForwardedProto('ws')).toBe('');
		expect(getTrustedForwardedProto('https, ws')).toBe('');
	});
});

describe('document revalidation caching', () => {
	it('keeps public document caching on 304 responses', async () => {
		const handle = createSecurityHeadersHandle();
		const response = await handle({
			event: {
				request: new Request('https://kaivalo.test/', {
					method: 'GET',
					headers: { Accept: 'text/html' }
				}),
				url: new URL('https://kaivalo.test/')
			} as never,
			resolve: async () =>
				new Response(null, {
					status: 304,
					headers: { 'Content-Type': 'text/html; charset=utf-8' }
				})
		});

		expect(response.headers.get('Cache-Control')).toBe(
			'public, max-age=300, stale-while-revalidate=60'
		);
	});
});
