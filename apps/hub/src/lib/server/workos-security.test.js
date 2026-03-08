import { describe, expect, it } from 'vitest';
import {
	createSecurityHeadersHandle,
	getStaticAssetCacheControl,
	getStaticAssetCacheControlForResponse,
	getTrustedForwardedProto,
	getValidatedWorkosEnv,
	shouldApplyStaticAssetHeaders
} from './workos-security.js';

const validLocalEnv = {
	WORKOS_CLIENT_ID: 'client_fixture',
	WORKOS_API_KEY: 'sk_fixture',
	WORKOS_REDIRECT_URI: 'http://localhost:3100/auth/callback',
	WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
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
		const pathname = '/robots.txt';
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
			event: /** @type {never} */ ({
				request: new Request(
					'https://kaivalo.test/_app/immutable/entry/app.js',
					{
						headers: {
							cookie: 'wos-session=fixture'
						}
					}
				),
				url: new URL('https://kaivalo.test/_app/immutable/entry/app.js')
			}),
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
});

describe('workos environment protocols', () => {
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

	it('rejects malformed WorkOS api hostnames', () => {
		expect(() =>
			getValidatedWorkosEnv({
				...validLocalEnv,
				WORKOS_API_HOSTNAME: 'https://auth.kaivalo-login.test/path'
			})
		).toThrow(
			/WORKOS_API_HOSTNAME must be a hostname without protocol, path, credentials, or port/
		);
	});
});

describe('trusted forwarded proto parsing', () => {
	it('uses the original client proto from the left side of comma-separated values', () => {
		expect(getTrustedForwardedProto('https, http')).toBe('https');
		expect(getTrustedForwardedProto('http, https')).toBe('http');
	});

	it('rejects unsupported trusted proxy proto values', () => {
		expect(getTrustedForwardedProto('ws, https')).toBe('');
	});
});
