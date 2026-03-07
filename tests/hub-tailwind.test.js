import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { httpGet, startHubPreview } from './helpers/hub-preview.js';

const MIN_STYLESHEET_BYTES = 1024;

function getStylesheetHref(html) {
	const linkTags = [...html.matchAll(/<link\b[^>]*>/gi)].map(
		(match) => match[0]
	);
	const hrefs = linkTags
		.filter((tag) => /rel="stylesheet"/i.test(tag))
		.map((tag) => tag.match(/href="([^"]+)"/i)?.[1] ?? null)
		.filter(Boolean);
	return (
		hrefs.find(
			(href) => href.startsWith('./_app/') || href.startsWith('/_app/')
		) ?? null
	);
}

describe('hub styling behavior', () => {
	let preview;
	let homepage;
	let stylesheet;
	let stylesheetUrl;

	before(async () => {
		preview = await startHubPreview();
		homepage = await httpGet(preview.baseUrl);
		const cssPath = getStylesheetHref(homepage.data);
		assert.ok(cssPath, 'expected stylesheet link in page output');
		stylesheetUrl = new URL(cssPath, preview.baseUrl).toString();
		stylesheet = await httpGet(stylesheetUrl);
	});

	after(async () => {
		await preview?.stop();
	});

	it('serves a generated stylesheet for the rendered landing experience', () => {
		assert.strictEqual(homepage.statusCode, 200);
		assert.strictEqual(stylesheet.statusCode, 200);
		assert.ok(
			stylesheetUrl.includes('/_app/'),
			'homepage should reference a built app stylesheet'
		);
	});

	it('uses local styling assets and safe link protocols', () => {
		assert.ok(!homepage.data.includes('api.fontshare.com'));
		assert.ok(!homepage.data.includes('cdn.fontshare.com'));
		const hrefMatches = [...homepage.data.matchAll(/\bhref="([^"]+)"/gi)].map(
			(match) => match[1]
		);
		assert.ok(
			hrefMatches.length > 0,
			'expected at least one link in homepage markup'
		);
		for (const href of hrefMatches) {
			assert.ok(
				href.startsWith('/') ||
					href.startsWith('./') ||
					href.startsWith('#') ||
					href.startsWith('https://') ||
					href.startsWith('mailto:'),
				`unexpected href protocol in homepage markup: ${href}`
			);
		}

		assert.match(
			String(stylesheet.headers['content-type'] ?? ''),
			/^text\/css/i
		);
		assert.ok(
			stylesheet.data.length > MIN_STYLESHEET_BYTES,
			'generated stylesheet should be non-trivial'
		);
		assert.match(
			stylesheet.data,
			/@font-face/i,
			'generated stylesheet should include font-face rules'
		);
		assert.match(
			stylesheet.data,
			/\/fonts\/clash-display-400\.woff2/i,
			'stylesheet should reference local font assets'
		);
		assert.ok(!/https?:\/\/api\.fontshare\.com/i.test(stylesheet.data));
		assert.ok(!/https?:\/\/cdn\.fontshare\.com/i.test(stylesheet.data));
	});

	it('serves local font assets over first-party static routes', async () => {
		const fontResponse = await httpGet(
			new URL('/fonts/clash-display-400.woff2', stylesheetUrl).toString()
		);
		assert.strictEqual(fontResponse.statusCode, 200);
		assert.match(
			String(fontResponse.headers['content-type'] ?? ''),
			/^font\//i
		);
	});
});
