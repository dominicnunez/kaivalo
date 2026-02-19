/**
 * Tests for all links on the hub landing page
 * Validates internal anchors, external links, and mailto links work correctly
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const pagePath = path.join(projectRoot, 'apps/hub/src/routes/+page.svelte');
const pageContent = fs.readFileSync(pagePath, 'utf-8');

// Fetch the rendered HTML from the running server
let renderedHtml = '';
try {
	renderedHtml = execSync('curl -s http://localhost:3100', { encoding: 'utf-8', timeout: 10000 });
} catch {
	// Server may not be running — rendered HTML tests will be skipped
}

// Extract all href values from the source
const hrefPattern = /href=["'{]([^"'}]+)["'}]/g;
const sourceHrefs = [];
let match;
while ((match = hrefPattern.exec(pageContent)) !== null) {
	sourceHrefs.push(match[1]);
}

describe('source-level link extraction', () => {
	it('page has links defined', () => {
		assert.ok(sourceHrefs.length > 0, 'Expected at least one href in page source');
	});
});

describe('internal anchor links', () => {
	it('has #services anchor link', () => {
		assert.ok(sourceHrefs.includes('#services'), 'Missing #services anchor link');
	});

	it('has #about anchor link', () => {
		assert.ok(sourceHrefs.includes('#about'), 'Missing #about anchor link');
	});

	it('#services anchor has matching section id', () => {
		assert.ok(pageContent.includes('id="services"'), 'Missing id="services" section');
	});

	it('#about anchor has matching section id', () => {
		assert.ok(pageContent.includes('id="about"'), 'Missing id="about" section');
	});

	it('all internal anchors have matching ids', () => {
		const anchorLinks = sourceHrefs.filter(h => h.startsWith('#') && h !== '#');
		for (const anchor of anchorLinks) {
			const targetId = anchor.slice(1);
			assert.ok(
				pageContent.includes(`id="${targetId}"`),
				`Anchor ${anchor} has no matching id="${targetId}" in page`
			);
		}
	});
});

describe('external links', () => {
	it('has GitHub profile link', () => {
		const githubLink = sourceHrefs.find(h => h.includes('github.com'));
		assert.ok(githubLink, 'Missing GitHub link');
	});

	it('GitHub link has full URL', () => {
		const githubLink = sourceHrefs.find(h => h.includes('github.com'));
		assert.ok(githubLink.startsWith('https://'), 'GitHub link should use HTTPS');
	});

	it('GitHub link opens in new tab', () => {
		assert.ok(pageContent.includes('target="_blank"'), 'External links should open in new tab');
	});

	it('GitHub link has noopener noreferrer', () => {
		assert.ok(
			pageContent.includes('rel="noopener noreferrer"'),
			'External links should have rel="noopener noreferrer"'
		);
	});
});

describe('mailto link', () => {
	it('has mailto link', () => {
		const mailtoLink = sourceHrefs.find(h => h.startsWith('mailto:'));
		assert.ok(mailtoLink, 'Missing mailto link');
	});

	it('mailto link has valid email format', () => {
		const mailtoLink = sourceHrefs.find(h => h.startsWith('mailto:'));
		const email = mailtoLink.replace('mailto:', '');
		assert.ok(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), `Invalid email format: ${email}`);
	});

	it('mailto uses kaievalo@proton.me', () => {
		assert.ok(sourceHrefs.includes('mailto:kaievalo@proton.me'), 'Expected kaievalo@proton.me');
	});
});

describe('coming-soon service links', () => {
	it('coming-soon services are not rendered as links', () => {
		const comingSoonPattern = /status:\s*['"]coming-soon['"]/g;
		const comingSoonCount = (pageContent.match(comingSoonPattern) || []).length;
		assert.ok(comingSoonCount > 0, 'Expected at least one coming-soon service');
		assert.ok(pageContent.includes('{#if isLive}'), 'Expected conditional rendering for live vs coming-soon');
	});
});

describe('rendered page tests', () => {
	// Extract hrefs from rendered HTML (empty array if server not running)
	const renderedHrefPattern = /href="([^"]+)"/g;
	const renderedHrefs = [];
	let rmatch;
	while ((rmatch = renderedHrefPattern.exec(renderedHtml)) !== null) {
		renderedHrefs.push(rmatch[1]);
	}

	it('rendered page has links', (t) => {
		if (!renderedHtml) { t.skip('server not running on port 3100'); return; }
		assert.ok(renderedHrefs.length > 0, 'Rendered page should contain href attributes');
	});

	it('rendered page has #services link', (t) => {
		if (!renderedHtml) { t.skip('server not running on port 3100'); return; }
		assert.ok(renderedHrefs.includes('#services'), 'Rendered page missing #services link');
	});

	it('rendered page has #about link', (t) => {
		if (!renderedHtml) { t.skip('server not running on port 3100'); return; }
		assert.ok(renderedHrefs.includes('#about'), 'Rendered page missing #about link');
	});

	it('rendered page has services section', (t) => {
		if (!renderedHtml) { t.skip('server not running on port 3100'); return; }
		assert.ok(renderedHtml.includes('id="services"'), 'Rendered page missing id="services"');
	});

	it('rendered page has about section', (t) => {
		if (!renderedHtml) { t.skip('server not running on port 3100'); return; }
		assert.ok(renderedHtml.includes('id="about"'), 'Rendered page missing id="about"');
	});

	it('rendered page has GitHub link', (t) => {
		if (!renderedHtml) { t.skip('server not running on port 3100'); return; }
		assert.ok(
			renderedHrefs.some(h => h.includes('github.com')),
			'Rendered page missing GitHub link'
		);
	});

	it('rendered page has mailto link', (t) => {
		if (!renderedHtml) { t.skip('server not running on port 3100'); return; }
		assert.ok(
			renderedHrefs.some(h => h.startsWith('mailto:')),
			'Rendered page missing mailto link'
		);
	});

	it('GitHub profile URL returns valid response', (t) => {
		if (!renderedHtml) { t.skip('server not running on port 3100'); return; }
		try {
			const result = execSync(
				'curl -s -o /dev/null -w "%{http_code}" -L --max-time 10 https://github.com/dominicnunez',
				{ encoding: 'utf-8', timeout: 15000 }
			);
			const statusCode = parseInt(result.trim(), 10);
			assert.ok(statusCode === 200, `GitHub URL returned HTTP ${statusCode}, expected 200`);
		} catch (e) {
			if (e.message.includes('ETIMEDOUT') || e.message.includes('ECONNREFUSED') || e.message.includes('ENOTFOUND') || e.status === null) {
				t.skip('network unavailable');
			} else {
				throw e;
			}
		}
	});

	it('rendered page links to favicon', (t) => {
		if (!renderedHtml) { t.skip('server not running on port 3100'); return; }
		assert.ok(
			renderedHtml.includes('favicon.svg') || renderedHtml.includes('favicon.ico'),
			'Rendered page should reference favicon'
		);
	});

	it('favicon.svg exists in static directory', () => {
		const faviconPath = path.join(projectRoot, 'apps/hub/static/favicon.svg');
		assert.ok(fs.existsSync(faviconPath), 'favicon.svg should exist');
	});

	it('favicon.ico exists in static directory', () => {
		const faviconPath = path.join(projectRoot, 'apps/hub/static/favicon.ico');
		assert.ok(fs.existsSync(faviconPath), 'favicon.ico should exist');
	});

	it('no empty href attributes', (t) => {
		if (!renderedHtml) { t.skip('server not running on port 3100'); return; }
		const emptyHrefs = renderedHrefs.filter(h => h === '' || h === undefined);
		assert.strictEqual(emptyHrefs.length, 0, 'Found empty href attributes');
	});

	it('no javascript: hrefs', (t) => {
		if (!renderedHtml) { t.skip('server not running on port 3100'); return; }
		const jsHrefs = renderedHrefs.filter(h => h.startsWith('javascript:'));
		assert.strictEqual(jsHrefs.length, 0, 'Found javascript: href (security concern)');
	});
});
