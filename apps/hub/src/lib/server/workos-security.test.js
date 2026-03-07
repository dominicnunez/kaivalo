import { describe, expect, it } from 'vitest';
import {
	getStaticAssetCacheControl,
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
});
