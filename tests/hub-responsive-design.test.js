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

// Read files
const pageContent = fs.readFileSync(pageFile, 'utf8');
const layoutContent = fs.readFileSync(layoutFile, 'utf8');
const containerContent = fs.readFileSync(containerFile, 'utf8');

console.log('\n=== Responsive Design Tests ===\n');

// -----------------------------------------------------------------------------
// Container Component Responsive Padding
// -----------------------------------------------------------------------------

console.log('--- Container Component Responsive Padding ---');

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
  assert(containerContent.includes('max-w-screen-md'), 'Container should have md max-width');
  assert(containerContent.includes('max-w-screen-lg'), 'Container should have lg max-width');
  assert(containerContent.includes('max-w-screen-xl'), 'Container should have xl max-width');
});

test('Container has centering (mx-auto)', () => {
  assert(containerContent.includes('mx-auto'), 'Container should have mx-auto for centering');
});

// -----------------------------------------------------------------------------
// Hero Section Responsive Typography
// -----------------------------------------------------------------------------

console.log('\n--- Hero Section Responsive Typography ---');

test('Hero headline has mobile text size (text-4xl)', () => {
  assert(pageContent.includes('text-4xl'), 'Hero headline should have text-4xl for mobile');
});

test('Hero headline has tablet text size (sm:text-5xl)', () => {
  assert(pageContent.includes('sm:text-5xl'), 'Hero headline should have sm:text-5xl for tablet');
});

test('Hero headline has desktop text size (md:text-6xl)', () => {
  assert(pageContent.includes('md:text-6xl'), 'Hero headline should have md:text-6xl for desktop');
});

test('Hero subheadline has mobile text size (text-xl)', () => {
  assert(pageContent.includes('text-xl'), 'Hero subheadline should have text-xl for mobile');
});

test('Hero subheadline has tablet text size (sm:text-2xl)', () => {
  assert(pageContent.includes('sm:text-2xl'), 'Hero subheadline should have sm:text-2xl for tablet');
});

test('Hero section has minimum height (min-h-[80vh])', () => {
  assert(pageContent.includes('min-h-[80vh]'), 'Hero section should have min-h-[80vh]');
});

test('Hero content has max-width constraint (max-w-2xl)', () => {
  assert(pageContent.includes('max-w-2xl'), 'Hero content should have max-w-2xl for readability');
});

// -----------------------------------------------------------------------------
// Services Grid Responsive Layout
// -----------------------------------------------------------------------------

console.log('\n--- Services Grid Responsive Layout ---');

test('Services grid has mobile layout (grid-cols-1)', () => {
  assert(pageContent.includes('grid-cols-1'), 'Services grid should have grid-cols-1 for mobile');
});

test('Services grid has tablet layout (md:grid-cols-2)', () => {
  assert(pageContent.includes('md:grid-cols-2'), 'Services grid should have md:grid-cols-2 for tablet');
});

test('Services grid has desktop layout (lg:grid-cols-3)', () => {
  assert(pageContent.includes('lg:grid-cols-3'), 'Services grid should have lg:grid-cols-3 for desktop');
});

test('Services grid has gap for spacing (gap-8)', () => {
  assert(pageContent.includes('gap-8'), 'Services grid should have gap-8 for spacing');
});

test('Services grid uses CSS Grid (grid)', () => {
  assert(pageContent.includes('class="grid'), 'Services grid should use grid display');
});

// -----------------------------------------------------------------------------
// About Section Responsive Typography
// -----------------------------------------------------------------------------

console.log('\n--- About Section Responsive Typography ---');

test('About headline has mobile text size (text-2xl)', () => {
  assert(pageContent.includes('text-2xl'), 'About headline should have text-2xl for mobile');
});

test('About headline has tablet text size (sm:text-3xl)', () => {
  assert(pageContent.includes('sm:text-3xl'), 'About headline should have sm:text-3xl for tablet');
});

test('About section uses Container with size="md"', () => {
  assert(pageContent.includes('size="md"'), 'About section should use Container with size="md"');
});

test('About content has max-width for readability (max-w-xl)', () => {
  assert(pageContent.includes('max-w-xl'), 'About content should have max-w-xl for readability');
});

// -----------------------------------------------------------------------------
// Footer Responsive Layout
// -----------------------------------------------------------------------------

console.log('\n--- Footer Responsive Layout ---');

test('Footer has mobile layout (flex-col)', () => {
  assert(pageContent.includes('flex-col'), 'Footer should have flex-col for mobile stacking');
});

test('Footer has tablet+ layout (sm:flex-row)', () => {
  assert(pageContent.includes('sm:flex-row'), 'Footer should have sm:flex-row for tablet+');
});

test('Footer has justify-between for desktop spread', () => {
  assert(pageContent.includes('justify-between'), 'Footer should have justify-between');
});

test('Footer has gap for mobile spacing (gap-4)', () => {
  assert(pageContent.includes('gap-4'), 'Footer should have gap-4 for mobile spacing');
});

// -----------------------------------------------------------------------------
// Layout Responsive Base
// -----------------------------------------------------------------------------

console.log('\n--- Layout Responsive Base ---');

test('Layout has minimum screen height (min-h-screen)', () => {
  assert(layoutContent.includes('min-h-screen'), 'Layout should have min-h-screen');
});

// -----------------------------------------------------------------------------
// Flexbox and Centering Utilities
// -----------------------------------------------------------------------------

console.log('\n--- Flexbox and Centering Utilities ---');

test('Page uses flexbox for centering (flex items-center)', () => {
  assert(pageContent.includes('flex items-center'), 'Page should use flex items-center');
});

test('Page uses justify-center for hero centering', () => {
  assert(pageContent.includes('justify-center'), 'Page should use justify-center');
});

test('Page uses mx-auto for content centering', () => {
  assert(pageContent.includes('mx-auto'), 'Page should use mx-auto for centering');
});

test('Page uses text-center for text alignment', () => {
  assert(pageContent.includes('text-center'), 'Page should use text-center');
});

// -----------------------------------------------------------------------------
// Section Padding
// -----------------------------------------------------------------------------

console.log('\n--- Section Padding ---');

test('Services section has vertical padding (py-20)', () => {
  const servicesSection = pageContent.match(/id="services"[^>]*class="[^"]*py-20[^"]*"/);
  assert(servicesSection || pageContent.includes('py-20'), 'Services section should have py-20 padding');
});

test('About section has vertical padding (py-20)', () => {
  assert(pageContent.includes('py-20'), 'About section should have py-20 padding');
});

test('Footer has vertical padding (py-8)', () => {
  assert(pageContent.includes('py-8'), 'Footer should have py-8 padding');
});

// -----------------------------------------------------------------------------
// Card Component Responsiveness
// -----------------------------------------------------------------------------

console.log('\n--- Card Component Responsiveness ---');

test('Service cards have flex layout (flex flex-col)', () => {
  assert(pageContent.includes('flex flex-col'), 'Service cards should have flex flex-col');
});

test('Service cards have full height (h-full)', () => {
  assert(pageContent.includes('h-full'), 'Service cards should have h-full');
});

// -----------------------------------------------------------------------------
// Breakpoint Coverage Summary
// -----------------------------------------------------------------------------

console.log('\n--- Breakpoint Coverage Summary ---');

test('Mobile breakpoint (default/no prefix) is covered', () => {
  // Check for non-prefixed classes that are mobile-first defaults
  assert(pageContent.includes('text-4xl'), 'Mobile: has mobile-first text sizes');
  assert(pageContent.includes('grid-cols-1'), 'Mobile: has single column grid');
  assert(pageContent.includes('flex-col'), 'Mobile: has stacked flex layout');
});

test('Small breakpoint (sm:) is covered', () => {
  const smBreakpoints = pageContent.match(/sm:[a-zA-Z0-9-]+/g) || [];
  assert(smBreakpoints.length >= 4, `Small breakpoint should have multiple uses, found ${smBreakpoints.length}`);
});

test('Medium breakpoint (md:) is covered', () => {
  const mdBreakpoints = pageContent.match(/md:[a-zA-Z0-9-]+/g) || [];
  assert(mdBreakpoints.length >= 2, `Medium breakpoint should have multiple uses, found ${mdBreakpoints.length}`);
});

test('Large breakpoint (lg:) is covered', () => {
  const lgBreakpoints = pageContent.match(/lg:[a-zA-Z0-9-]+/g) || [];
  assert(lgBreakpoints.length >= 1, `Large breakpoint should have at least one use, found ${lgBreakpoints.length}`);
});

// -----------------------------------------------------------------------------
// Results
// -----------------------------------------------------------------------------

console.log('\n=== Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('');

if (failed > 0) {
  process.exit(1);
}
