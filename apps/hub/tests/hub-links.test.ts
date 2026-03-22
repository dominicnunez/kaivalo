import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import {
	httpGet,
	startHubPreview
} from '../../../tests/helpers/hub-preview.ts';

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

	it('renders actionable navigation from the homepage', () => {
		assert.strictEqual(homepage.statusCode, 200);
		const hrefs = getAnchors(document).map(
			(anchor) => anchor.getAttribute('href') ?? ''
		);
		const actionableLink = hrefs.find(
			(href) =>
				href === '/services' ||
				href.startsWith('/auth/sign-in') ||
				href.startsWith('/user_management/authorize') ||
				href.startsWith('https://api.workos.com/user_management/authorize')
		);

		assert.ok(
			actionableLink,
			'Expected homepage to expose a trusted services or sign-in action'
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
