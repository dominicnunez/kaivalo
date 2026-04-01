import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { httpGet, startHubPreview } from './helpers/hub-preview.ts';

type PreviewHandle = Awaited<ReturnType<typeof startHubPreview>>;
type PreviewResponse = Awaited<ReturnType<typeof httpGet>>;

function isNonNullString(value: string | null): value is string {
	return value !== null;
}

function getStylesheetHref(html: string): string | null {
	const linkTags = [...html.matchAll(/<link\b[^>]*>/gi)].map(
		(match) => match[0]
	);
	const hrefs = linkTags
		.filter((tag) => /rel="stylesheet"/i.test(tag))
		.map((tag) => tag.match(/href="([^"]+)"/i)?.[1] ?? null)
		.filter(isNonNullString);
	return (
		hrefs.find(
			(href) => href.startsWith('./_app/') || href.startsWith('/_app/')
		) ?? null
	);
}

function getStylesheetAssetUrls(css: string, stylesheetUrl: string): string[] {
	const baseUrl = new URL(stylesheetUrl);
	const assetUrls = new Set<string>();

	for (const match of css.matchAll(/url\(([^)]+)\)/gi)) {
		const rawValue = match[1]?.trim().replace(/^['"]|['"]$/g, '') ?? '';
		if (!rawValue || rawValue.startsWith('data:') || rawValue.startsWith('#')) {
			continue;
		}

		assetUrls.add(new URL(rawValue, baseUrl).toString());
	}

	return [...assetUrls];
}

describe('hub styling behavior', () => {
	let preview: PreviewHandle | undefined;
	let homepage: PreviewResponse | undefined;
	let stylesheet: PreviewResponse | undefined;
	let stylesheetUrl: string | undefined;

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
		assert.ok(homepage);
		assert.ok(stylesheet);
		assert.ok(stylesheetUrl);
		assert.strictEqual(homepage.statusCode, 200);
		assert.strictEqual(stylesheet.statusCode, 200);
		assert.ok(
			stylesheetUrl.includes('/_app/'),
			'homepage should reference a built app stylesheet'
		);
	});

	it('uses local styling assets and safe link protocols', async () => {
		assert.ok(homepage);
		assert.ok(stylesheet);
		assert.ok(stylesheetUrl);
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
		assert.ok(!/https?:\/\/api\.fontshare\.com/i.test(stylesheet.data));
		assert.ok(!/https?:\/\/cdn\.fontshare\.com/i.test(stylesheet.data));

		const stylesheetAssetUrls = getStylesheetAssetUrls(
			stylesheet.data,
			stylesheetUrl
		);
		assert.ok(
			stylesheetAssetUrls.length > 0,
			'expected stylesheet to reference at least one first-party asset'
		);

		const stylesheetOrigin = new URL(stylesheetUrl).origin;
		for (const assetUrl of stylesheetAssetUrls) {
			assert.strictEqual(
				new URL(assetUrl).origin,
				stylesheetOrigin,
				`stylesheet asset should remain first-party: ${assetUrl}`
			);

			const assetResponse = await httpGet(assetUrl);
			assert.strictEqual(
				assetResponse.statusCode,
				200,
				`expected stylesheet asset to be served successfully: ${assetUrl}`
			);
		}
	});
});
