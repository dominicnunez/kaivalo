import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const containerPath = join(rootDir, 'packages', 'ui', 'Container.svelte');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.error(`  ${error.message}`);
    failed++;
  }
}

console.log('\n=== packages/ui/Container.svelte Tests ===\n');

test('Container.svelte exists', () => {
  assert.ok(existsSync(containerPath), 'Container.svelte should exist');
});

let content;
test('Container.svelte is readable', () => {
  content = readFileSync(containerPath, 'utf-8');
  assert.ok(content, 'Should be able to read Container.svelte');
});

test('Container.svelte has script section', () => {
  assert.ok(content.includes('<script>'), 'Should have script opening tag');
  assert.ok(content.includes('</script>'), 'Should have script closing tag');
});

test('Container.svelte uses Svelte 5 $props rune', () => {
  assert.ok(content.includes('$props()'), 'Should use $props() rune for props');
});

test('Container.svelte has size prop with default value', () => {
  assert.ok(content.includes('size'), 'Should have size prop');
  assert.ok(content.includes("size = 'lg'"), 'Should default to lg size');
});

test('Container.svelte supports sm size', () => {
  assert.ok(content.includes('sm:'), 'Should define sm size');
  assert.ok(content.includes('max-w-screen-sm'), 'sm should use max-w-screen-sm');
});

test('Container.svelte supports md size', () => {
  assert.ok(content.includes('md:'), 'Should define md size');
  assert.ok(content.includes('max-w-screen-md'), 'md should use max-w-screen-md');
});

test('Container.svelte supports lg size', () => {
  assert.ok(content.includes('lg:'), 'Should define lg size');
  assert.ok(content.includes('max-w-screen-lg'), 'lg should use max-w-screen-lg');
});

test('Container.svelte supports xl size', () => {
  assert.ok(content.includes('xl:'), 'Should define xl size');
  assert.ok(content.includes('max-w-screen-xl'), 'xl should use max-w-screen-xl');
});

test('Container.svelte supports full size', () => {
  assert.ok(content.includes('full:'), 'Should define full size');
  assert.ok(content.includes('max-w-full'), 'full should use max-w-full');
});

test('Container.svelte has responsive padding', () => {
  assert.ok(content.includes('px-4'), 'Should have base mobile padding');
  assert.ok(content.includes('sm:px-6'), 'Should have sm breakpoint padding');
  assert.ok(content.includes('lg:px-8'), 'Should have lg breakpoint padding');
});

test('Container.svelte has max-width wrapper', () => {
  assert.ok(content.includes('max-w-screen'), 'Should have max-width classes');
  assert.ok(content.includes('w-full'), 'Should have w-full for full width');
});

test('Container.svelte is centered by default', () => {
  assert.ok(content.includes('mx-auto'), 'Should have mx-auto for centering');
});

test('Container.svelte uses $derived for computed classes', () => {
  assert.ok(content.includes('$derived'), 'Should use $derived rune for computed classes');
});

test('Container.svelte has div element', () => {
  assert.ok(content.includes('<div'), 'Should have div opening tag');
  assert.ok(content.includes('</div>'), 'Should have div closing tag');
});

test('Container.svelte supports children via snippet', () => {
  assert.ok(content.includes('children'), 'Should accept children prop');
  assert.ok(content.includes('@render'), 'Should use @render for children');
});

test('Container.svelte supports custom class prop', () => {
  assert.ok(content.includes('class: className'), 'Should accept custom class prop');
  assert.ok(content.includes('className'), 'Should use className in computed classes');
});

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
