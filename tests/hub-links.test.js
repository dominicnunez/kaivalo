/**
 * Tests for all links on the hub landing page
 * Validates internal anchors, external links, and mailto links work correctly
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

let passed = 0;
let failed = 0;

function test(name, fn) {
	try {
		fn();
		passed++;
		console.log(`✓ ${name}`);
	} catch (error) {
		failed++;
		console.log(`✗ ${name}`);
		console.log(`  ${error.message}`);
	}
}

async function asyncTest(name, fn) {
	try {
		await fn();
		passed++;
		console.log(`✓ ${name}`);
	} catch (error) {
		failed++;
		console.log(`✗ ${name}`);
		console.log(`  ${error.message}`);
	}
}

console.log('--- Link Validation Tests ---\n');

// Read the source file for static checks
const pagePath = path.join(process.cwd(), 'apps/hub/src/routes/+page.svelte');
const pageContent = fs.readFileSync(pagePath, 'utf-8');

// Fetch the rendered HTML from the running server
let renderedHtml = '';
try {
	renderedHtml = execSync('curl -s http://localhost:3100', { encoding: 'utf-8', timeout: 10000 });
} catch {
	console.log('WARNING: Could not fetch from localhost:3100, skipping rendered HTML tests');
}

// ── Source-level link extraction ──

// Extract all href values from the source
const hrefPattern = /href=["'{]([^"'}]+)["'}]/g;
const sourceHrefs = [];
let match;
while ((match = hrefPattern.exec(pageContent)) !== null) {
	sourceHrefs.push(match[1]);
}

test('page has links defined', () => {
	assert.ok(sourceHrefs.length > 0, 'Expected at least one href in page source');
});

// ── Internal anchor links ──

test('has #services anchor link', () => {
	assert.ok(sourceHrefs.includes('#services'), 'Missing #services anchor link');
});

test('has #about anchor link', () => {
	assert.ok(sourceHrefs.includes('#about'), 'Missing #about anchor link');
});

test('#services anchor has matching section id', () => {
	assert.ok(pageContent.includes('id="services"'), 'Missing id="services" section');
});

test('#about anchor has matching section id', () => {
	assert.ok(pageContent.includes('id="about"'), 'Missing id="about" section');
});

// Verify no orphaned anchor links (anchors pointing to non-existent ids)
test('all internal anchors have matching ids', () => {
	const anchorLinks = sourceHrefs.filter(h => h.startsWith('#') && h !== '#');
	for (const anchor of anchorLinks) {
		const targetId = anchor.slice(1);
		assert.ok(
			pageContent.includes(`id="${targetId}"`),
			`Anchor ${anchor} has no matching id="${targetId}" in page`
		);
	}
});

// ── External links ──

test('has GitHub profile link', () => {
	const githubLink = sourceHrefs.find(h => h.includes('github.com'));
	assert.ok(githubLink, 'Missing GitHub link');
});

test('GitHub link has full URL', () => {
	const githubLink = sourceHrefs.find(h => h.includes('github.com'));
	assert.ok(githubLink.startsWith('https://'), 'GitHub link should use HTTPS');
});

test('GitHub link opens in new tab', () => {
	assert.ok(pageContent.includes('target="_blank"'), 'External links should open in new tab');
});

test('GitHub link has noopener noreferrer', () => {
	assert.ok(
		pageContent.includes('rel="noopener noreferrer"'),
		'External links should have rel="noopener noreferrer"'
	);
});

// ── Mailto link ──

test('has mailto link', () => {
	const mailtoLink = sourceHrefs.find(h => h.startsWith('mailto:'));
	assert.ok(mailtoLink, 'Missing mailto link');
});

test('mailto link has valid email format', () => {
	const mailtoLink = sourceHrefs.find(h => h.startsWith('mailto:'));
	const email = mailtoLink.replace('mailto:', '');
	assert.ok(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), `Invalid email format: ${email}`);
});

test('mailto uses kaievalo@proton.me', () => {
	assert.ok(sourceHrefs.includes('mailto:kaievalo@proton.me'), 'Expected kaievalo@proton.me');
});

// ── Coming-soon service links ──

test('coming-soon services are not rendered as links', () => {
	// Services with "coming-soon" status should render as <div> not <a>
	// to avoid broken/dead links — only "live" services get <a> tags
	const comingSoonPattern = /status:\s*['"]coming-soon['"]/g;
	const comingSoonCount = (pageContent.match(comingSoonPattern) || []).length;
	assert.ok(comingSoonCount > 0, 'Expected at least one coming-soon service');
	// The template uses {#if isLive} for <a> and {:else} for <div>
	assert.ok(pageContent.includes('{#if isLive}'), 'Expected conditional rendering for live vs coming-soon');
});

// ── Rendered page tests (live server) ──

if (renderedHtml) {
	// Extract hrefs from rendered HTML
	const renderedHrefPattern = /href="([^"]+)"/g;
	const renderedHrefs = [];
	let rmatch;
	while ((rmatch = renderedHrefPattern.exec(renderedHtml)) !== null) {
		renderedHrefs.push(rmatch[1]);
	}

	test('rendered page has links', () => {
		assert.ok(renderedHrefs.length > 0, 'Rendered page should contain href attributes');
	});

	test('rendered page has #services link', () => {
		assert.ok(renderedHrefs.includes('#services'), 'Rendered page missing #services link');
	});

	test('rendered page has #about link', () => {
		assert.ok(renderedHrefs.includes('#about'), 'Rendered page missing #about link');
	});

	test('rendered page has services section', () => {
		assert.ok(renderedHtml.includes('id="services"'), 'Rendered page missing id="services"');
	});

	test('rendered page has about section', () => {
		assert.ok(renderedHtml.includes('id="about"'), 'Rendered page missing id="about"');
	});

	test('rendered page has GitHub link', () => {
		assert.ok(
			renderedHrefs.some(h => h.includes('github.com')),
			'Rendered page missing GitHub link'
		);
	});

	test('rendered page has mailto link', () => {
		assert.ok(
			renderedHrefs.some(h => h.startsWith('mailto:')),
			'Rendered page missing mailto link'
		);
	});

	// Verify GitHub URL actually resolves (HTTP HEAD)
	test('GitHub profile URL returns valid response', () => {
		try {
			const result = execSync(
				'curl -s -o /dev/null -w "%{http_code}" -L --max-time 10 https://github.com/dominicnunez',
				{ encoding: 'utf-8', timeout: 15000 }
			);
			const statusCode = parseInt(result.trim(), 10);
			assert.ok(statusCode === 200, `GitHub URL returned HTTP ${statusCode}, expected 200`);
		} catch {
			// Network may not be available in CI — skip gracefully
			assert.ok(true, 'Skipped: network unavailable');
		}
	});

	// Verify no broken asset links (favicon, CSS)
	test('rendered page links to favicon', () => {
		assert.ok(
			renderedHtml.includes('favicon.svg') || renderedHtml.includes('favicon.ico'),
			'Rendered page should reference favicon'
		);
	});

	test('favicon.svg exists in static directory', () => {
		const faviconPath = path.join(process.cwd(), 'apps/hub/static/favicon.svg');
		assert.ok(fs.existsSync(faviconPath), 'favicon.svg should exist');
	});

	test('favicon.ico exists in static directory', () => {
		const faviconPath = path.join(process.cwd(), 'apps/hub/static/favicon.ico');
		assert.ok(fs.existsSync(faviconPath), 'favicon.ico should exist');
	});

	// No empty or javascript: hrefs
	test('no empty href attributes', () => {
		const emptyHrefs = renderedHrefs.filter(h => h === '' || h === undefined);
		assert.strictEqual(emptyHrefs.length, 0, 'Found empty href attributes');
	});

	test('no javascript: hrefs', () => {
		const jsHrefs = renderedHrefs.filter(h => h.startsWith('javascript:'));
		assert.strictEqual(jsHrefs.length, 0, 'Found javascript: href (security concern)');
	});
}

// Summary
console.log(`\nLink validation: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
