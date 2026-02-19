/**
 * Tests for apps/hub Footer section
 * Validates the footer has copyright, GitHub link, and contact link
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

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

const projectRoot = path.resolve(import.meta.dirname, '..');
const pagePath = path.join(projectRoot, 'apps/hub/src/routes/+page.svelte');
const pageContent = fs.readFileSync(pagePath, 'utf-8');

console.log('Testing Footer...\n');

// Footer structure
test('has <footer> element', () => {
	assert.ok(pageContent.includes('<footer'));
});

test('has closing </footer> tag', () => {
	assert.ok(pageContent.includes('</footer>'));
});

test('footer has border-t', () => {
	assert.ok(pageContent.includes('border-t'));
});

// Copyright
test('has copyright 2026', () => {
	assert.ok(pageContent.includes('2026'));
});

test('has kaivalo brand name', () => {
	assert.ok(pageContent.includes('kaivalo'));
});

// GitHub link
test('has GitHub link', () => {
	assert.ok(pageContent.includes('github.com'));
});

test('GitHub link opens in new tab', () => {
	assert.ok(pageContent.includes('target="_blank"'));
});

test('GitHub link has security attributes', () => {
	assert.ok(pageContent.includes('rel="noopener noreferrer"'));
});

test('has GitHub icon', () => {
	assert.ok(pageContent.includes('Github'));
});

// Contact link
test('has contact email link', () => {
	assert.ok(pageContent.includes('mailto:kaievalo@proton.me'));
});

test('has Mail icon', () => {
	assert.ok(pageContent.includes('Mail'));
});

// Layout
test('footer uses flex layout', () => {
	assert.ok(pageContent.includes('flex'));
});

test('responsive flex direction', () => {
	assert.ok(pageContent.includes('flex-col') && pageContent.includes('sm:flex-row'));
});

test('uses Container component', () => {
	assert.ok(pageContent.includes('<Container'));
});

test('has hover transition', () => {
	assert.ok(pageContent.includes('transition'));
});

// Summary
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
