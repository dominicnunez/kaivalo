import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { httpGet, startHubPreview } from './helpers/hub-preview.js';

describe('hub seo metadata behavior', () => {
	it('renders complete social and search metadata in the homepage document', async () => {
		const preview = await startHubPreview();
		try {
			const homepage = await httpGet(preview.baseUrl);
			const dom = new JSDOM(homepage.data);
			const { document } = dom.window;

			assert.strictEqual(homepage.statusCode, 200);

			const title = document.querySelector('title')?.textContent?.trim() ?? '';
			const description =
				document
					.querySelector('meta[name="description"]')
					?.getAttribute('content')
					?.trim() ?? '';
			const imageAlt =
				document
					.querySelector('meta[property="og:image:alt"]')
					?.getAttribute('content')
					?.trim() ?? '';
			const twitterCard =
				document
					.querySelector('meta[name="twitter:card"]')
					?.getAttribute('content')
					?.trim() ?? '';

			assert.notStrictEqual(title, '', 'title should be non-empty');
			assert.notStrictEqual(description, '', 'description should be non-empty');
			assert.notStrictEqual(imageAlt, '', 'og:image:alt should be non-empty');
			assert.strictEqual(twitterCard, 'summary_large_image');

			dom.window.close();
		} finally {
			await preview.stop();
		}
	});

	it('renders absolute HTTPS URLs for social preview metadata', async () => {
		const preview = await startHubPreview();
		try {
			const homepage = await httpGet(preview.baseUrl);
			const dom = new JSDOM(homepage.data);
			const { document } = dom.window;

			const ogUrl = new URL(
				document
					.querySelector('meta[property="og:url"]')
					?.getAttribute('content') ?? ''
			);
			const ogImage = new URL(
				document
					.querySelector('meta[property="og:image"]')
					?.getAttribute('content') ?? ''
			);
			const twitterImage = new URL(
				document
					.querySelector('meta[name="twitter:image"]')
					?.getAttribute('content') ?? ''
			);

			assert.strictEqual(ogUrl.protocol, 'https:');
			assert.strictEqual(ogImage.protocol, 'https:');
			assert.strictEqual(twitterImage.protocol, 'https:');
			assert.strictEqual(ogUrl.hostname, 'kaivalo.com');
			assert.strictEqual(ogImage.hostname, 'kaivalo.com');
			assert.strictEqual(twitterImage.hostname, 'kaivalo.com');
			assert.strictEqual(ogImage.pathname, '/og-image.png');
			assert.strictEqual(twitterImage.pathname, '/og-image.png');

			dom.window.close();
		} finally {
			await preview.stop();
		}
	});
});
