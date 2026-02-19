import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const testResults = { passed: 0, failed: 0 };

function test(name, fn) {
	try {
		fn();
		testResults.passed++;
		console.log(`✓ ${name}`);
	} catch (error) {
		testResults.failed++;
		console.log(`✗ ${name}`);
		console.log(`  ${error.message}`);
	}
}

const projectRoot = path.resolve(import.meta.dirname, '..');
const pagePath = path.join(projectRoot, 'apps/hub/src/routes/+page.svelte');
const pageContent = fs.readFileSync(pagePath, 'utf-8');

console.log('Testing About Section...\n');

// Section structure
test('about section has id="about"', () => {
	assert.ok(pageContent.includes('id="about"'));
});

test('about section is a <section> element', () => {
	assert.ok(pageContent.includes('<section id="about"'));
});

// Avatar
test('has avatar with K initial', () => {
	// Avatar shows "K" letter
	assert.ok(pageContent.includes('>K<') || pageContent.includes('>K </'));
});

test('avatar has gradient background', () => {
	assert.ok(pageContent.includes('linear-gradient'));
});

test('avatar has rounded corners', () => {
	assert.ok(pageContent.includes('rounded-2xl') || pageContent.includes('rounded-full'));
});

// Name and location
test('has Kai Valo name', () => {
	assert.ok(pageContent.includes('Kai Valo'));
});

test('has Helsinki location', () => {
	assert.ok(pageContent.includes('Helsinki'));
});

// About copy
test('has about copy about building tools', () => {
	assert.ok(pageContent.includes('build tools') || pageContent.includes('cut through complexity'));
});

test('has copy about information asymmetry', () => {
	assert.ok(pageContent.includes('Information asymmetry') || pageContent.includes('solvable problem'));
});

// Layout
test('uses grid layout', () => {
	assert.ok(pageContent.includes('grid') && pageContent.includes('md:grid-cols-12'));
});

test('uses Container component', () => {
	assert.ok(pageContent.includes('<Container'));
});

test('has responsive typography', () => {
	assert.ok(pageContent.includes('sm:text-') || pageContent.includes('md:text-'));
});

// Summary
console.log(`\n${testResults.passed} passed, ${testResults.failed} failed`);
if (testResults.failed > 0) process.exit(1);
