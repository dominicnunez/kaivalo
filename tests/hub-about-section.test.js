import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const testResults = { passed: 0, failed: 0 };

function test(name, fn) {
	try {
		fn();
		console.log(`✓ ${name}`);
		testResults.passed++;
	} catch (error) {
		console.log(`✗ ${name}`);
		console.log(`  ${error.message}`);
		testResults.failed++;
	}
}

const pagePath = '/home/kai/pets/kaivalo/apps/hub/src/routes/+page.svelte';
const pageContent = fs.readFileSync(pagePath, 'utf-8');

console.log('\nTesting About Section in +page.svelte...\n');

// Section structure tests
test('About section exists', () => {
	assert.ok(pageContent.includes('<!-- About Section -->'), 'Should have About Section comment');
});

test('About section has id="about"', () => {
	assert.ok(pageContent.includes('id="about"'), 'Section should have id="about" for potential navigation');
});

test('About section uses section element', () => {
	assert.ok(pageContent.includes('<section id="about"'), 'Should use semantic section element');
});

test('About section has white background', () => {
	assert.ok(pageContent.includes('bg-white'), 'Should have bg-white class for contrast with services section');
});

test('About section has padding', () => {
	assert.ok(pageContent.includes('py-20'), 'Should have vertical padding (py-20)');
});

// Container tests
test('About section uses Container component', () => {
	assert.ok(
		pageContent.includes('Container size="md"') ||
		pageContent.includes('<Container'),
		'Should use Container component for consistent layout'
	);
});

test('About section content is centered', () => {
	assert.ok(pageContent.includes('text-center'), 'Content should be centered with text-center');
});

// Avatar placeholder tests
test('Avatar placeholder exists', () => {
	assert.ok(
		pageContent.includes('w-24 h-24') || pageContent.includes('rounded-full'),
		'Should have avatar placeholder element'
	);
});

test('Avatar has gradient background', () => {
	assert.ok(
		pageContent.includes('bg-gradient-to-br') || pageContent.includes('from-blue'),
		'Avatar should have gradient background'
	);
});

test('Avatar is centered', () => {
	assert.ok(pageContent.includes('mx-auto'), 'Avatar should be centered with mx-auto');
});

test('Avatar has initial K', () => {
	assert.ok(pageContent.includes('>K<'), 'Avatar should display K initial for Kai');
});

// Headline tests
test('About section has "Built by Kai Valo" heading', () => {
	assert.ok(
		pageContent.includes('Built by Kai Valo'),
		'Should have "Built by Kai Valo" heading'
	);
});

test('Heading uses h2 element', () => {
	// Check that there's an h2 containing the about heading text
	const aboutSection = pageContent.substring(pageContent.indexOf('<!-- About Section -->'));
	assert.ok(aboutSection.includes('<h2'), 'About section should use h2 for heading');
});

test('Heading has appropriate font size', () => {
	assert.ok(
		pageContent.includes('text-2xl') || pageContent.includes('text-3xl'),
		'Heading should have appropriate font size'
	);
});

test('Heading is responsive', () => {
	assert.ok(
		pageContent.includes('sm:text-3xl') || pageContent.includes('md:text-3xl'),
		'Heading should have responsive sizing'
	);
});

// Personality-forward copy tests
test('About section has main description paragraph', () => {
	assert.ok(
		pageContent.includes('I build tools') || pageContent.includes('solve real problems'),
		'Should have personality-forward description'
	);
});

test('Copy mentions no fluff/buzzwords approach', () => {
	assert.ok(
		pageContent.includes('no fluff') || pageContent.includes('no buzzwords') || pageContent.includes('No hype'),
		'Should mention the no-nonsense approach'
	);
});

test('Copy mentions practical/useful nature', () => {
	assert.ok(
		pageContent.includes('practical') || pageContent.includes('helps you'),
		'Should mention practical/useful nature of tools'
	);
});

test('Has secondary/supporting paragraph', () => {
	// Count paragraphs in about section
	const aboutSection = pageContent.substring(pageContent.indexOf('<!-- About Section -->'));
	const pTagCount = (aboutSection.match(/<p /g) || []).length;
	assert.ok(pTagCount >= 2, 'Should have at least 2 paragraphs for personality copy');
});

test('Copy mentions making complex things simple', () => {
	assert.ok(
		pageContent.includes('complex things simple') || pageContent.includes('understand'),
		'Should mention simplifying complex topics'
	);
});

// Styling tests
test('Description text has muted color', () => {
	assert.ok(
		pageContent.includes('text-gray-600') || pageContent.includes('text-gray-500'),
		'Description should have muted gray text color'
	);
});

test('Description has max width for readability', () => {
	assert.ok(
		pageContent.includes('max-w-xl') || pageContent.includes('max-w-2xl'),
		'Description should have max width for readability'
	);
});

test('About section comes after services section', () => {
	const servicesIndex = pageContent.indexOf('id="services"');
	const aboutIndex = pageContent.indexOf('id="about"');
	assert.ok(aboutIndex > servicesIndex, 'About section should come after services section');
});

// Overall structure test
test('About section has complete structure', () => {
	const aboutSection = pageContent.substring(pageContent.indexOf('<!-- About Section -->'));
	assert.ok(aboutSection.includes('</section>'), 'Section should be properly closed');
	assert.ok(aboutSection.includes('</Container>'), 'Container should be properly closed');
});

console.log(`\n${testResults.passed} passed, ${testResults.failed} failed`);

if (testResults.failed > 0) {
	process.exit(1);
}
