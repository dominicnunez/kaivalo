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

const pagePath = path.join(process.cwd(), 'apps/hub/src/routes/+page.svelte');
const pageContent = fs.readFileSync(pagePath, 'utf-8');

// File structure tests
test('page.svelte exists', () => {
	assert.ok(fs.existsSync(pagePath));
});

test('page has script section with lang=ts', () => {
	assert.ok(pageContent.includes('<script lang="ts">'));
});

// Import tests
test('imports Button from @kaivalo/ui', () => {
	assert.ok(pageContent.includes("import { Button } from '@kaivalo/ui'"));
});

test('imports Container from @kaivalo/ui', () => {
	assert.ok(pageContent.includes("import { Container } from '@kaivalo/ui'"));
});

// Hero section structure tests
test('has hero section element', () => {
	assert.ok(pageContent.includes('<section') && pageContent.includes('Hero Section'));
});

test('hero has gradient background from-blue-50', () => {
	assert.ok(pageContent.includes('from-blue-50'));
});

test('hero has gradient via-white', () => {
	assert.ok(pageContent.includes('via-white'));
});

test('hero has gradient to-white', () => {
	assert.ok(pageContent.includes('to-white'));
});

test('hero uses bg-gradient-to-b', () => {
	assert.ok(pageContent.includes('bg-gradient-to-b'));
});

test('hero has min-h-[80vh] for viewport height', () => {
	assert.ok(pageContent.includes('min-h-[80vh]'));
});

test('hero uses flex centering', () => {
	assert.ok(pageContent.includes('flex') && pageContent.includes('items-center') && pageContent.includes('justify-center'));
});

// Headline tests
test('has correct headline text', () => {
	assert.ok(pageContent.includes('AI Tools That Actually Help'));
});

test('headline is h1 element', () => {
	assert.ok(pageContent.includes('<h1'));
});

test('headline has responsive font sizes', () => {
	assert.ok(pageContent.includes('text-4xl') && pageContent.includes('sm:text-5xl') && pageContent.includes('md:text-6xl'));
});

test('headline has font-bold', () => {
	assert.ok(pageContent.includes('font-bold'));
});

// Subheadline tests
test('has correct subheadline text', () => {
	assert.ok(pageContent.includes('Practical tools built by Kai Valo'));
});

test('subheadline includes "No hype, just utility"', () => {
	assert.ok(pageContent.includes('No hype, just utility'));
});

test('subheadline has responsive font sizes', () => {
	assert.ok(pageContent.includes('text-xl') && pageContent.includes('sm:text-2xl'));
});

test('subheadline has gray text color', () => {
	assert.ok(pageContent.includes('text-gray-600'));
});

test('subheadline has max-width constraint', () => {
	assert.ok(pageContent.includes('max-w-2xl'));
});

// CTA Button tests
test('has Button component for CTA', () => {
	assert.ok(pageContent.includes('<Button'));
});

test('Button has primary variant', () => {
	assert.ok(pageContent.includes('variant="primary"'));
});

test('Button has lg size', () => {
	assert.ok(pageContent.includes('size="lg"'));
});

test('Button has onclick handler', () => {
	assert.ok(pageContent.includes('onclick={scrollToServices}'));
});

test('Button text is "View Services"', () => {
	assert.ok(pageContent.includes('View Services'));
});

// Smooth scroll functionality tests
test('has scrollToServices function', () => {
	assert.ok(pageContent.includes('function scrollToServices()'));
});

test('scrollToServices uses getElementById for services', () => {
	assert.ok(pageContent.includes("getElementById('services')"));
});

test('scrollToServices uses smooth scroll behavior', () => {
	assert.ok(pageContent.includes("behavior: 'smooth'"));
});

test('scrollToServices uses scrollIntoView', () => {
	assert.ok(pageContent.includes('scrollIntoView'));
});

// Services section target tests
test('has services section with id="services"', () => {
	assert.ok(pageContent.includes('id="services"'));
});

test('services section is a <section> element', () => {
	// Check there are at least 2 section elements (hero and services)
	const sectionMatches = pageContent.match(/<section/g);
	assert.ok(sectionMatches && sectionMatches.length >= 2);
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
