import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubDir = path.join(__dirname, '..', 'apps', 'hub');
const pageFile = path.join(hubDir, 'src', 'routes', '+page.svelte');
const layoutFile = path.join(hubDir, 'src', 'routes', '+layout.svelte');
const containerFile = path.join(__dirname, '..', 'packages', 'ui', 'Container.svelte');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  ${e.message}`);
    failed++;
  }
}

const pageContent = fs.readFileSync(pageFile, 'utf8');
const layoutContent = fs.readFileSync(layoutFile, 'utf8');
const containerContent = fs.readFileSync(containerFile, 'utf8');

console.log('\n=== Responsive Design Tests ===\n');

// Container Component
console.log('--- Container Component ---');

test('Container has mobile padding (px-4)', () => {
  assert(containerContent.includes('px-4'), 'Container should have px-4 for mobile');
});

test('Container has tablet padding (sm:px-6)', () => {
  assert(containerContent.includes('sm:px-6'), 'Container should have sm:px-6 for tablet');
});

test('Container has desktop padding (lg:px-8)', () => {
  assert(containerContent.includes('lg:px-8'), 'Container should have lg:px-8 for desktop');
});

test('Container has responsive max-width options', () => {
  assert(containerContent.includes('max-w-screen-sm'), 'Container should have sm max-width');
  assert(containerContent.includes('max-w-screen-lg'), 'Container should have lg max-width');
});

test('Container has centering (mx-auto)', () => {
  assert(containerContent.includes('mx-auto'), 'Container should have mx-auto for centering');
});

// Hero Section
console.log('\n--- Hero Section ---');

test('Hero headline has mobile text size (text-4xl)', () => {
  assert(pageContent.includes('text-4xl'), 'Hero headline should have text-4xl for mobile');
});

test('Hero headline has tablet text size (sm:text-5xl)', () => {
  assert(pageContent.includes('sm:text-5xl'), 'Hero headline should have sm:text-5xl for tablet');
});

test('Hero headline has desktop text size (md:text-7xl)', () => {
  assert(pageContent.includes('md:text-7xl'), 'Hero headline should have md:text-7xl for desktop');
});

test('Hero subheadline has responsive sizes', () => {
  assert(pageContent.includes('sm:text-lg') || pageContent.includes('md:text-xl'), 'Hero subheadline should have responsive sizes');
});

test('Hero content has max-width constraint', () => {
  assert(pageContent.includes('max-w-2xl') || pageContent.includes('max-w-xl'), 'Hero content should have max-width');
});

// Services Grid
console.log('\n--- Services Grid ---');

test('Services grid has mobile layout (grid-cols-1)', () => {
  assert(pageContent.includes('grid-cols-1'), 'Services grid should have grid-cols-1 for mobile');
});

test('Services grid has tablet layout (sm:grid-cols-2)', () => {
  assert(pageContent.includes('sm:grid-cols-2'), 'Services grid should have sm:grid-cols-2 for tablet');
});

test('Services grid has gap for spacing', () => {
  assert(pageContent.includes('gap-4') || pageContent.includes('gap-6'), 'Services grid should have gap');
});

test('Services grid uses CSS Grid', () => {
  assert(pageContent.includes('grid'), 'Services grid should use grid display');
});

// About Section
console.log('\n--- About Section ---');

test('About has responsive typography', () => {
  assert(pageContent.includes('sm:text-2xl') || pageContent.includes('text-xl'), 'About should have responsive typography');
});

test('About content has max-width for readability', () => {
  assert(pageContent.includes('max-w-lg') || pageContent.includes('max-w-xl'), 'About content should have max-width');
});

test('About uses responsive grid layout', () => {
  assert(pageContent.includes('md:grid-cols-12') || pageContent.includes('md:grid-cols-2'), 'About should use responsive grid');
});

// Footer
console.log('\n--- Footer ---');

test('Footer has mobile layout (flex-col)', () => {
  assert(pageContent.includes('flex-col'), 'Footer should have flex-col for mobile');
});

test('Footer has tablet+ layout (sm:flex-row)', () => {
  assert(pageContent.includes('sm:flex-row'), 'Footer should have sm:flex-row for tablet+');
});

test('Footer has justify-between', () => {
  assert(pageContent.includes('justify-between'), 'Footer should have justify-between');
});

test('Footer has padding (py-8)', () => {
  assert(pageContent.includes('py-8'), 'Footer should have py-8 padding');
});

// Layout
console.log('\n--- Layout ---');

test('Layout has minimum screen height (min-h-screen)', () => {
  assert(layoutContent.includes('min-h-screen'), 'Layout should have min-h-screen');
});

// Breakpoint Coverage
console.log('\n--- Breakpoint Coverage ---');

test('Mobile breakpoint (default) is covered', () => {
  assert(pageContent.includes('text-4xl'), 'Mobile: has mobile-first text sizes');
  assert(pageContent.includes('grid-cols-1'), 'Mobile: has single column grid');
  assert(pageContent.includes('flex-col'), 'Mobile: has stacked flex layout');
});

test('Small breakpoint (sm:) is covered', () => {
  const smBreakpoints = pageContent.match(/sm:[a-zA-Z0-9-[\]]+/g) || [];
  assert(smBreakpoints.length >= 4, `sm: breakpoint should have multiple uses, found ${smBreakpoints.length}`);
});

test('Medium breakpoint (md:) is covered', () => {
  const mdBreakpoints = pageContent.match(/md:[a-zA-Z0-9-[\]]+/g) || [];
  assert(mdBreakpoints.length >= 2, `md: breakpoint should have multiple uses, found ${mdBreakpoints.length}`);
});

// Results
console.log('\n=== Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('');

if (failed > 0) {
  process.exit(1);
}
