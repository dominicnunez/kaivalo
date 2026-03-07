import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { httpGet, startHubPreview } from './helpers/hub-preview.js';

function assertStaticAssetHeaders(response) {
	const contentLength = Number(response.headers['content-length'] ?? 0);
	assert.ok(
		contentLength > 0,
		'asset responses should include a positive content length'
	);
	assert.ok(
		response.headers['last-modified'],
		'asset responses should include last-modified'
	);
}

function assertStaticSecurityHeaders(response) {
	assert.strictEqual(response.headers['x-frame-options'], 'DENY');
	assert.strictEqual(response.headers['x-content-type-options'], 'nosniff');
	assert.strictEqual(
		response.headers['referrer-policy'],
		'strict-origin-when-cross-origin'
	);
	assert.strictEqual(
		response.headers['permissions-policy'],
		'camera=(), microphone=(), geolocation=()'
	);
}

function assertCacheControl(response, expected) {
	const normalize = (value) => String(value ?? '').replace(/\s+/g, '');
	assert.strictEqual(
		normalize(response.headers['cache-control']),
		normalize(expected)
	);
}

describe('hub favicon delivery', () => {
	let preview;
	let homepage;

	before(async () => {
		preview = await startHubPreview();
		homepage = await httpGet(preview.baseUrl);
	});

	after(async () => {
		await preview?.stop();
	});

	it('references favicon assets from the rendered document', () => {
		assert.strictEqual(homepage.statusCode, 200);
		assert.ok(homepage.data.includes('favicon.svg'));
		assert.ok(homepage.data.includes('favicon.ico'));
	});

	it('serves favicon.ico as a static asset', async () => {
		const response = await httpGet(`${preview.baseUrl}/favicon.ico`);
		assert.strictEqual(response.statusCode, 200);
		assertStaticAssetHeaders(response);
		assertStaticSecurityHeaders(response);
		assertCacheControl(
			response,
			'public, max-age=86400, stale-while-revalidate=600'
		);
	});

	it('serves favicon.svg with an svg content type', async () => {
		const response = await httpGet(`${preview.baseUrl}/favicon.svg`);
		assert.strictEqual(response.statusCode, 200);
		assert.match(
			String(response.headers['content-type'] ?? ''),
			/^image\/svg\+xml/
		);
		assertStaticAssetHeaders(response);
		assertStaticSecurityHeaders(response);
		assertCacheControl(
			response,
			'public, max-age=86400, stale-while-revalidate=600'
		);
	});

	it('serves web app icons as png images', async () => {
		const icon192 = await httpGet(`${preview.baseUrl}/favicon-192.png`);
		const icon512 = await httpGet(`${preview.baseUrl}/favicon-512.png`);

		assert.strictEqual(icon192.statusCode, 200);
		assert.match(String(icon192.headers['content-type'] ?? ''), /^image\/png/);
		assertStaticAssetHeaders(icon192);
		assertStaticSecurityHeaders(icon192);
		assertCacheControl(
			icon192,
			'public, max-age=86400, stale-while-revalidate=600'
		);

		assert.strictEqual(icon512.statusCode, 200);
		assert.match(String(icon512.headers['content-type'] ?? ''), /^image\/png/);
		assertStaticAssetHeaders(icon512);
		assertStaticSecurityHeaders(icon512);
		assertCacheControl(
			icon512,
			'public, max-age=86400, stale-while-revalidate=600'
		);
	});

	it('serves og-image with static hardening and bounded caching', async () => {
		const response = await httpGet(`${preview.baseUrl}/og-image.png`);
		assert.strictEqual(response.statusCode, 200);
		assert.match(String(response.headers['content-type'] ?? ''), /^image\/png/);
		assertStaticAssetHeaders(response);
		assertStaticSecurityHeaders(response);
		assertCacheControl(
			response,
			'public, max-age=86400, stale-while-revalidate=600'
		);
	});

	it('serves immutable app assets with immutable cache policy and hardening', async () => {
		const match = homepage.data.match(/\/_app\/immutable\/[^"'<>\s)]+/);
		assert.ok(
			match,
			'homepage should reference at least one immutable app asset'
		);

		const response = await httpGet(`${preview.baseUrl}${match[0]}`);
		assert.strictEqual(response.statusCode, 200);
		assertStaticAssetHeaders(response);
		assertStaticSecurityHeaders(response);
		assertCacheControl(response, 'public, max-age=31536000, immutable');
	});

	it('serves font assets with static hardening and reusable caching', async () => {
		const response = await httpGet(
			`${preview.baseUrl}/fonts/clash-display-400.woff2`
		);
		assert.strictEqual(response.statusCode, 200);
		assert.match(
			String(response.headers['content-type'] ?? ''),
			/^font\/woff2/
		);
		assertStaticAssetHeaders(response);
		assertStaticSecurityHeaders(response);
		assertCacheControl(
			response,
			'public, max-age=604800, stale-while-revalidate=86400'
		);
	});
});
