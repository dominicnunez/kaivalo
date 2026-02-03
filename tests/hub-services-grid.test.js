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

// Services section structure tests
test('has services section with id="services"', () => {
	assert.ok(pageContent.includes('id="services"'));
});

test('services section is a <section> element', () => {
	assert.ok(pageContent.includes('<section id="services"'));
});

test('services section has py-20 padding', () => {
	const sectionMatch = pageContent.match(/<section id="services"[^>]*>/);
	assert.ok(sectionMatch && sectionMatch[0].includes('py-20'));
});

test('services section has bg-gray-50 background', () => {
	const sectionMatch = pageContent.match(/<section id="services"[^>]*>/);
	assert.ok(sectionMatch && sectionMatch[0].includes('bg-gray-50'));
});

// Grid layout tests
test('has grid container for services', () => {
	assert.ok(pageContent.includes('class="grid'));
});

test('grid has 1 column on mobile (grid-cols-1)', () => {
	assert.ok(pageContent.includes('grid-cols-1'));
});

test('grid has 2 columns on tablet (md:grid-cols-2)', () => {
	assert.ok(pageContent.includes('md:grid-cols-2'));
});

test('grid has 3 columns on desktop (lg:grid-cols-3)', () => {
	assert.ok(pageContent.includes('lg:grid-cols-3'));
});

test('grid has gap-8 for spacing', () => {
	assert.ok(pageContent.includes('gap-8'));
});

// Services data tests
test('has services array defined', () => {
	assert.ok(pageContent.includes('const services = ['));
});

test('services array has MechanicAI entry', () => {
	assert.ok(pageContent.includes("title: 'MechanicAI'"));
});

test('MechanicAI has correct description', () => {
	assert.ok(pageContent.includes("Turn repair jargon into plain English"));
});

test('MechanicAI has live status', () => {
	assert.ok(pageContent.includes("status: 'live'"));
});

test('MechanicAI has correct link', () => {
	assert.ok(pageContent.includes("link: 'https://mechai.kaivalo.com'"));
});

test('has placeholder/coming soon service', () => {
	assert.ok(pageContent.includes("status: 'coming-soon'"));
});

test('placeholder has "More tools on the way" description', () => {
	assert.ok(pageContent.includes("More tools on the way"));
});

// Icon imports tests
test('imports Wrench icon from lucide-svelte', () => {
	assert.ok(pageContent.includes('Wrench') && pageContent.includes('lucide-svelte'));
});

test('imports Sparkles icon from lucide-svelte', () => {
	assert.ok(pageContent.includes('Sparkles') && pageContent.includes('lucide-svelte'));
});

test('services use Wrench icon for MechanicAI', () => {
	assert.ok(pageContent.includes('icon: Wrench'));
});

test('services use Sparkles icon for placeholder', () => {
	assert.ok(pageContent.includes('icon: Sparkles'));
});

// Component imports tests
test('imports Card from @kaivalo/ui', () => {
	assert.ok(pageContent.includes('Card') && pageContent.includes('@kaivalo/ui'));
});

test('imports Badge from @kaivalo/ui', () => {
	assert.ok(pageContent.includes('Badge') && pageContent.includes('@kaivalo/ui'));
});

// ServiceCard rendering tests
test('uses Card component for service cards', () => {
	assert.ok(pageContent.includes('<Card'));
});

test('Card has variant prop based on link', () => {
	assert.ok(pageContent.includes("variant={service.link !== '#' ? 'link' : 'default'}"));
});

test('Card has href prop for links', () => {
	assert.ok(pageContent.includes("href={service.link !== '#' ? service.link : undefined}"));
});

test('Card has hover={true} prop', () => {
	assert.ok(pageContent.includes('hover={true}'));
});

// Badge tests
test('uses Badge component for status', () => {
	assert.ok(pageContent.includes('<Badge'));
});

test('Badge has status prop', () => {
	assert.ok(pageContent.includes('status={service.status}'));
});

test('Badge has size="sm" prop', () => {
	assert.ok(pageContent.includes('size="sm"'));
});

test('Badge displays "Live" for live status', () => {
	assert.ok(pageContent.includes("service.status === 'live' ? 'Live'"));
});

test('Badge displays "Coming Soon" for coming-soon status', () => {
	assert.ok(pageContent.includes("'Coming Soon'"));
});

// Icon rendering tests
test('uses svelte:component for dynamic icon rendering', () => {
	assert.ok(pageContent.includes('svelte:component'));
});

test('icon component uses service.icon', () => {
	assert.ok(pageContent.includes('this={service.icon}'));
});

test('icon has w-6 h-6 sizing', () => {
	assert.ok(pageContent.includes('w-6 h-6'));
});

test('icon has text-blue-600 color', () => {
	assert.ok(pageContent.includes('text-blue-600'));
});

// Icon container tests
test('icon container has rounded-lg', () => {
	assert.ok(pageContent.includes('rounded-lg'));
});

test('icon container has bg-blue-100 background', () => {
	assert.ok(pageContent.includes('bg-blue-100'));
});

// Card content structure tests
test('has h3 for service title', () => {
	assert.ok(pageContent.includes('<h3'));
});

test('title uses service.title', () => {
	assert.ok(pageContent.includes('{service.title}'));
});

test('description uses service.description', () => {
	assert.ok(pageContent.includes('{service.description}'));
});

// Each loop test
test('uses #each to iterate over services', () => {
	assert.ok(pageContent.includes('{#each services as service}'));
});

test('closes #each block', () => {
	assert.ok(pageContent.includes('{/each}'));
});

// Link indicator tests
test('has conditional link indicator', () => {
	assert.ok(pageContent.includes("{#if service.link !== '#'}"));
});

test('link indicator shows "Visit →"', () => {
	assert.ok(pageContent.includes('Visit →'));
});

// Section header test
test('services section has h2 header "Services"', () => {
	assert.ok(pageContent.includes('<h2') && pageContent.includes('>Services</h2>'));
});

// Summary
console.log('\n-------------------');
console.log(`Total: ${testResults.length} tests`);
console.log(`Passed: ${testResults.filter(t => t.passed).length}`);
console.log(`Failed: ${testResults.filter(t => !t.passed).length}`);

if (testResults.some(t => !t.passed)) {
	process.exit(1);
}
