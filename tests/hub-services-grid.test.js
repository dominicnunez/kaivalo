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

console.log('Testing Services Grid...\n');

// Section structure
test('services section has id="services"', () => {
	assert.ok(pageContent.includes('id="services"'));
});

test('services section is a <section> element', () => {
	assert.ok(pageContent.includes('<section id="services"'));
});

test('services section has dots-bg pattern', () => {
	assert.ok(pageContent.includes('dots-bg'));
});

// Grid layout
test('has responsive grid layout', () => {
	assert.ok(pageContent.includes('grid'));
	assert.ok(pageContent.includes('grid-cols-1'));
});

test('has sm:grid-cols-2 for tablet', () => {
	assert.ok(pageContent.includes('sm:grid-cols-2'));
});

// Section header
test('has Services label', () => {
	assert.ok(pageContent.includes('Services'));
});

test('has section heading', () => {
	assert.ok(pageContent.includes('<h2'));
});

test('section heading uses font-display', () => {
	const h2Match = pageContent.match(/<h2[^>]*class="[^"]*font-display/);
	assert.ok(h2Match, 'h2 should use font-display class');
});

// Services data
test('has services array', () => {
	assert.ok(pageContent.includes('const services'));
});

test('services include Auto Repair Decoder', () => {
	assert.ok(pageContent.includes('Auto Repair Decoder'));
});

test('services include Wrench icon', () => {
	assert.ok(pageContent.includes('Wrench'));
});

test('services include Sparkles icon', () => {
	assert.ok(pageContent.includes('Sparkles'));
});

test('services have status field', () => {
	assert.ok(pageContent.includes("status:"));
});

test('services have description field', () => {
	assert.ok(pageContent.includes("description:"));
});

test('services have link field', () => {
	assert.ok(pageContent.includes("link:"));
});

// Card rendering
test('uses #each to render service cards', () => {
	assert.ok(pageContent.includes('{#each services'));
});

test('has live/coming-soon conditional rendering', () => {
	assert.ok(pageContent.includes('isLive') || pageContent.includes("status === 'live'"));
});

test('card-glow class for hover effects', () => {
	assert.ok(pageContent.includes('card-glow'));
});

test('cards have rounded-xl corners', () => {
	assert.ok(pageContent.includes('rounded-xl'));
});

test('cards have border', () => {
	assert.ok(pageContent.includes('border'));
});

test('uses Container component', () => {
	assert.ok(pageContent.includes('<Container'));
});

test('has dynamic icon rendering', () => {
	assert.ok(pageContent.includes('svelte:component') || pageContent.includes('service.icon'));
});

// Summary
console.log('\n-------------------');
console.log(`Total: ${testResults.length} tests`);
console.log(`Passed: ${testResults.filter(t => t.passed).length}`);
console.log(`Failed: ${testResults.filter(t => !t.passed).length}`);

if (testResults.some(t => !t.passed)) {
	process.exit(1);
}
