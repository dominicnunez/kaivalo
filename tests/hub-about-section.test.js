import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { httpGet, startHubPreview } from './helpers/hub-preview.js';

let preview;
let homepage;
let dom;
let document;

describe('hub about section', () => {
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

	it('renders a targetable about section within the main landmark', () => {
		assert.strictEqual(homepage.statusCode, 200);
		const aboutSection = document.getElementById('about');
		assert.ok(aboutSection, 'about section should exist');
		assert.strictEqual(
			aboutSection.tagName.toLowerCase(),
			'section',
			'about should be a section landmark'
		);

		const main = document.querySelector('main');
		assert.ok(main, 'main landmark should exist');
		assert.ok(
			main.contains(aboutSection),
			'about section should render within main content'
		);

		const heading = aboutSection.querySelector('h1, h2, h3, h4, h5, h6');
		assert.ok(heading, 'about section should expose a heading for navigation');
		assert.ok(
			(heading.textContent ?? '').trim().length > 0,
			'about heading text should be non-empty'
		);
	});

	it('provides non-empty descriptive text content', () => {
		const aboutSection = document.getElementById('about');
		assert.ok(aboutSection, 'about section should exist');

		const paragraphs = Array.from(aboutSection.querySelectorAll('p'));
		assert.ok(
			paragraphs.length >= 2,
			'about section should include descriptive paragraph content'
		);
		for (const paragraph of paragraphs) {
			const text = (paragraph.textContent ?? '').replace(/\s+/g, ' ').trim();
			assert.ok(
				text.length > 0,
				'about section paragraphs should not be empty'
			);
		}
	});
});
