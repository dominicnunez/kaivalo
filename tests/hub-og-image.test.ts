import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { httpGet, startHubPreview } from './helpers/hub-preview.ts';

describe('hub og image', () => {
	let preview;
	let homepage;
	let ogImageResponse;
	let document;

	before(async () => {
		preview = await startHubPreview();
		homepage = await httpGet(preview.baseUrl);
		ogImageResponse = await httpGet(`${preview.baseUrl}/og-image.png`);
		document = new JSDOM(homepage.data).window.document;
	});

	after(async () => {
		await preview?.stop();
	});

	it('keeps og-image payload in social-preview size budget', () => {
		const contentLength = Number(
			ogImageResponse.headers['content-length'] ?? 0
		);
		assert.ok(
			contentLength > 0 && contentLength < 500000,
			`OG image should be <500KB, got ${contentLength} bytes`
		);
	});

	it('renders metadata that points to the served og image URL', () => {
		const ogImage =
			document
				.querySelector('meta[property="og:image"]')
				?.getAttribute('content') ?? '';
		const twitterImage =
			document
				.querySelector('meta[name="twitter:image"]')
				?.getAttribute('content') ?? '';

		assert.ok(
			ogImage.endsWith('/og-image.png'),
			'og:image should reference og-image.png'
		);
		assert.strictEqual(
			twitterImage,
			ogImage,
			'twitter:image should match og:image'
		);
	});
});
