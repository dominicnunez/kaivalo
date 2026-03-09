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
