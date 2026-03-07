import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { httpGet, startHubPreview } from './helpers/hub-preview.js';

let preview;
let homepage;
let dom;
let document;

describe('hub services grid', () => {
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

	it('renders a services section with structured cards', () => {
		assert.strictEqual(homepage.statusCode, 200);
		const servicesSection = document.getElementById('services');
		assert.ok(servicesSection, 'Services section should be present');

		const headings = servicesSection.querySelectorAll('h3');
		const descriptions = servicesSection.querySelectorAll('p');
		assert.ok(
			headings.length >= 1,
			'Services section should include service headings'
		);
		assert.ok(
			descriptions.length >= 1,
			'Services section should include service descriptions'
		);
	});

	it('does not render service action links while services are marked as coming soon', () => {
		const servicesSection = document.getElementById('services');
		assert.ok(servicesSection, 'Services section should be present');
		const hrefs = Array.from(servicesSection.querySelectorAll('a[href]')).map(
			(link) => link.getAttribute('href') ?? ''
		);
		assert.strictEqual(
			hrefs.length,
			0,
			'Services section should not expose action links before launch'
		);
	});
});
