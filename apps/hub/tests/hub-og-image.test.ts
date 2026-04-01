import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { httpGet, startHubPreview } from './helpers/hub-preview.ts';

describe('hub og image', () => {
	type PreviewHandle = Awaited<ReturnType<typeof startHubPreview>>;
	type HttpResponse = Awaited<ReturnType<typeof httpGet>>;
	let preview: PreviewHandle | undefined;
	let homepage: HttpResponse | undefined;
	let ogImageResponse: HttpResponse | undefined;
	let document: Document | undefined;

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
		assert.ok(ogImageResponse);
		const contentLength = Number(
			ogImageResponse.headers['content-length'] ?? 0
		);
		assert.ok(
			contentLength > 0 && contentLength < 500000,
			`OG image should be <500KB, got ${contentLength} bytes`
		);
	});

	it('renders metadata that points to the served og image URL', () => {
		assert.ok(document);
		const pageDocument = document;
		const ogImage =
			pageDocument
				.querySelector('meta[property="og:image"]')
				?.getAttribute('content') ?? '';
		const twitterImage =
			pageDocument
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
