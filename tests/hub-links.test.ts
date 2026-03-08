import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { httpGet, startHubPreview } from './helpers/hub-preview.ts';

function getAnchors(document) {
	return Array.from(document.querySelectorAll('a[href]'));
}

let preview;
let homepage;
let dom;
let document;

describe('hub links', () => {
	before(async () => {
		preview = await startHubPreview();
		homepage = await httpGet(preview.baseUrl);
		dom = new JSDOM(homepage.data);
		document = dom.window.document;
	});

	after(async () => {
		dom?.window.close();
		await preview?.stop();
	});

	it('renders links in the homepage output', () => {
		const anchors = getAnchors(document);
		assert.strictEqual(homepage.statusCode, 200);
		assert.ok(
			anchors.length > 0,
			'Expected at least one href in rendered output'
		);
	});

	it('does not render internal hash links without explicit in-page navigation', () => {
		const hrefs = getAnchors(document)
			.map((anchor) => anchor.getAttribute('href') ?? '')
			.filter((href) => href.startsWith('#') && href !== '#');
		assert.strictEqual(
			hrefs.length,
			0,
			'Homepage should not expose hash links without anchor navigation UI'
		);
	});

	it('exposes a valid mailto contact link', () => {
		const hrefs = getAnchors(document).map(
			(anchor) => anchor.getAttribute('href') ?? ''
		);
		const mailtoLink = hrefs.find((href) => href.startsWith('mailto:'));

		assert.ok(mailtoLink, 'Missing mailto link');
		const email = mailtoLink.replace('mailto:', '');
		assert.ok(
			/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
			`Invalid email format: ${email}`
		);
	});

	it('does not expose empty or javascript links', () => {
		const hrefs = getAnchors(document).map(
			(anchor) => anchor.getAttribute('href') ?? ''
		);
		assert.strictEqual(hrefs.filter((href) => href.trim() === '').length, 0);
		assert.strictEqual(
			hrefs.filter((href) =>
				href.trim().toLowerCase().startsWith('javascript:')
			).length,
			0
		);
	});
});
