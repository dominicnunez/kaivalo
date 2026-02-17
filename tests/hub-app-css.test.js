import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();
const appCssPath = join(projectRoot, 'apps', 'hub', 'src', 'app.css');

let testCount = 0;
let passCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  ${err.message}`);
  }
}

console.log('Testing apps/hub/src/app.css...\n');

test('app.css file exists', () => {
  assert.ok(existsSync(appCssPath), 'app.css should exist at apps/hub/src/app.css');
});

const content = existsSync(appCssPath) ? readFileSync(appCssPath, 'utf8') : '';

test('app.css contains Tailwind import', () => {
  assert.ok(content.includes('@import "tailwindcss"'), 'Should have Tailwind CSS v4 import');
});

test('app.css imports fonts', () => {
  assert.ok(
    content.includes("fonts.googleapis.com") || content.includes("fontshare.com"),
    'Should import fonts from a CDN'
  );
});

test('app.css includes font weights 400, 500, 600', () => {
  assert.ok(content.includes('400'), 'Should include regular weight (400)');
  assert.ok(content.includes('500'), 'Should include medium weight (500)');
  assert.ok(content.includes('600'), 'Should include semibold weight (600)');
});

test('app.css has @layer base block', () => {
  assert.ok(content.includes('@layer base'), 'Should have @layer base for base styles');
});

test('app.css sets body font-family', () => {
  assert.ok(
    content.includes("font-family:"),
    "Should set body font-family"
  );
});

test('app.css includes system font fallbacks', () => {
  assert.ok(content.includes('sans-serif'), 'Should include sans-serif fallback');
});

test('app.css has smooth scroll behavior', () => {
  assert.ok(content.includes('scroll-behavior: smooth'), 'Should have smooth scroll for hero CTA');
});

test('app.css has font smoothing', () => {
  assert.ok(
    content.includes('-webkit-font-smoothing') || content.includes('font-smooth'),
    'Should have webkit font smoothing'
  );
});

test('app.css has selection styling', () => {
  assert.ok(content.includes('::selection'), 'Should have selection styling');
});

test('app.css has @layer components block', () => {
  assert.ok(content.includes('@layer components'), 'Should have @layer components for custom components');
});

test('app.css has display=swap for font loading', () => {
  assert.ok(content.includes('display=swap'), 'Should use display=swap for font loading performance');
});

test('app.css has header comment', () => {
  assert.ok(content.includes('Kaivalo Hub'), 'Should have header comment mentioning Kaivalo Hub');
});

test('app.css has CSS custom properties', () => {
  assert.ok(content.includes(':root'), 'Should define CSS custom properties');
  assert.ok(content.includes('--bg-primary'), 'Should have background color tokens');
  assert.ok(content.includes('--accent'), 'Should have accent color token');
});

test('app.css has animation utilities', () => {
  assert.ok(content.includes('@keyframes') || content.includes('animation'), 'Should have animation utilities');
});

console.log(`\n${passCount}/${testCount} tests passed`);

if (passCount !== testCount) {
  process.exit(1);
}
