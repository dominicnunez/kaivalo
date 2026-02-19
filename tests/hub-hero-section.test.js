import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const testResults = [];

function test(name, fn) {
	try {
		fn();
		testResults.push({ name, passed: true });
		console.log(`✓ ${name}`);
	} catch (error) {
		testResults.push({ name, passed: false, error: error.message });
		console.log(`✗ ${name}`);
		console.log(`  Error: ${error.message}`);
	}
}

const projectRoot = path.resolve(import.meta.dirname, '..');
const pagePath = path.join(projectRoot, 'apps/hub/src/routes/+page.svelte');
const pageContent = fs.readFileSync(pagePath, 'utf-8');

// File structure tests
test('page.svelte exists', () => {
	assert.ok(fs.existsSync(pagePath));
});

test('page has script section with lang=ts', () => {
	assert.ok(pageContent.includes('<script lang="ts">'));
});

// Import tests
test('imports Container from @kaivalo/ui', () => {
	assert.ok(pageContent.includes('Container') && pageContent.includes("'@kaivalo/ui'"));
});

test('imports icons from lucide-svelte', () => {
	assert.ok(pageContent.includes('lucide-svelte'));
	assert.ok(pageContent.includes('Wrench'));
});

// Hero section structure tests
test('has hero section element', () => {
	assert.ok(pageContent.includes('<section') && pageContent.includes('HERO'));
});

test('hero has aurora background', () => {
	assert.ok(pageContent.includes('aurora'));
});

test('hero uses flex items-center', () => {
	assert.ok(pageContent.includes('flex') && pageContent.includes('items-center'));
});

// Headline tests
test('has headline text', () => {
	assert.ok(pageContent.includes('Tools that') && pageContent.includes('solve things'));
});

test('headline is h1 element', () => {
	assert.ok(pageContent.includes('<h1'));
});

test('headline has responsive font sizes', () => {
	assert.ok(pageContent.includes('text-4xl') && pageContent.includes('sm:text-5xl') && pageContent.includes('md:text-7xl'));
});

test('headline has font-bold', () => {
	assert.ok(pageContent.includes('font-bold'));
});

test('headline uses font-display class', () => {
	assert.ok(pageContent.includes('font-display'));
});

// Subheadline tests
test('has subheadline text', () => {
	assert.ok(pageContent.includes('Simple tools for complicated problems'));
});

test('subheadline has responsive font sizes', () => {
	assert.ok(pageContent.includes('text-base') || pageContent.includes('sm:text-lg') || pageContent.includes('md:text-xl'));
});

test('subheadline has max-width constraint', () => {
	assert.ok(pageContent.includes('max-w-xl') || pageContent.includes('max-w-2xl'));
});

// CTA tests
test('has CTA link to services', () => {
	assert.ok(pageContent.includes('href="#services"'));
});

test('CTA text says "See what\'s live"', () => {
	assert.ok(pageContent.includes("See what's live") || pageContent.includes('See what'));
});

test('has secondary CTA link to about', () => {
	assert.ok(pageContent.includes('href="#about"'));
});

// Origin tag
test('has Helsinki location tag', () => {
	assert.ok(pageContent.includes('Helsinki'));
});

// Animation classes
test('has entrance animations', () => {
	assert.ok(pageContent.includes('animate-enter'));
});

// Services section target tests
test('has services section with id="services"', () => {
	assert.ok(pageContent.includes('id="services"'));
});

test('has at least 3 section elements', () => {
	const sectionMatches = pageContent.match(/<section/g);
	assert.ok(sectionMatches && sectionMatches.length >= 3);
});

// Container usage tests
test('uses Container component for layout', () => {
	assert.ok(pageContent.includes('<Container'));
});

test('Container has size="lg" prop', () => {
	assert.ok(pageContent.includes('size="lg"'));
});

// Summary
console.log('\n-------------------');
console.log(`Total: ${testResults.length} tests`);
console.log(`Passed: ${testResults.filter(t => t.passed).length}`);
console.log(`Failed: ${testResults.filter(t => !t.passed).length}`);

if (testResults.some(t => !t.passed)) {
	process.exit(1);
}
