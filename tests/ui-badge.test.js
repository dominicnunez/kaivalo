import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const badgePath = join(rootDir, 'packages', 'ui', 'Badge.svelte');

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

console.log('\n=== packages/ui/Badge.svelte Tests ===\n');

test('Badge.svelte exists', () => {
  assert.ok(existsSync(badgePath), 'Badge.svelte should exist');
});

let content;
test('Badge.svelte is readable', () => {
  content = readFileSync(badgePath, 'utf-8');
  assert.ok(content, 'Should be able to read Badge.svelte');
});

test('Badge.svelte has script section', () => {
  assert.ok(content.includes('<script>'), 'Should have script opening tag');
  assert.ok(content.includes('</script>'), 'Should have script closing tag');
});

test('Badge.svelte uses Svelte 5 $props rune', () => {
  assert.ok(content.includes('$props()'), 'Should use $props() rune for props');
});

test('Badge.svelte has status prop with default value', () => {
  assert.ok(content.includes('status'), 'Should have status prop');
  assert.ok(content.includes("status = 'default'"), 'Should default to default status');
});

test('Badge.svelte supports live status', () => {
  assert.ok(content.includes("'live':"), 'Should define live status classes');
  assert.ok(content.includes('bg-emerald-100'), 'Live should use emerald background');
  assert.ok(content.includes('text-emerald-800'), 'Live should use emerald text');
});

test('Badge.svelte supports beta status', () => {
  assert.ok(content.includes("'beta':"), 'Should define beta status classes');
  assert.ok(content.includes('bg-amber-100'), 'Beta should use amber background');
  assert.ok(content.includes('text-amber-800'), 'Beta should use amber text');
});

test('Badge.svelte supports coming-soon status', () => {
  assert.ok(content.includes("'coming-soon':"), 'Should define coming-soon status classes');
  assert.ok(content.includes('bg-gray-100'), 'Coming soon should use gray background');
  assert.ok(content.includes('text-gray-600'), 'Coming soon should use gray text');
});

test('Badge.svelte supports default status', () => {
  assert.ok(content.includes("'default':"), 'Should define default status classes');
  assert.ok(content.includes('bg-blue-100'), 'Default should use blue background');
  assert.ok(content.includes('text-blue-800'), 'Default should use blue text');
});

test('Badge.svelte has size prop with md default', () => {
  assert.ok(content.includes('size'), 'Should have size prop');
  assert.ok(content.includes("size = 'md'"), 'Should default to md size');
});

test('Badge.svelte supports sm size', () => {
  assert.ok(content.includes('sm:'), 'Should define sm size classes');
  assert.ok(content.includes('text-xs'), 'sm size should use text-xs');
});

test('Badge.svelte supports md size', () => {
  assert.ok(content.includes('md:'), 'Should define md size classes');
  assert.ok(content.includes('text-sm'), 'md size should use text-sm');
});

test('Badge.svelte uses $derived for computed classes', () => {
  assert.ok(content.includes('$derived'), 'Should use $derived rune for computed classes');
});

test('Badge.svelte has span element for inline display', () => {
  assert.ok(content.includes('<span'), 'Should have span opening tag');
  assert.ok(content.includes('</span>'), 'Should have span closing tag');
});

test('Badge.svelte supports children via snippet', () => {
  assert.ok(content.includes('children'), 'Should accept children prop');
  assert.ok(content.includes('@render'), 'Should use @render for children');
});

test('Badge.svelte has rounded-full styling', () => {
  assert.ok(content.includes('rounded-full'), 'Should have pill-shaped border radius');
});

test('Badge.svelte has inline-flex display', () => {
  assert.ok(content.includes('inline-flex'), 'Should be inline-flex for proper alignment');
});

test('Badge.svelte supports custom class prop', () => {
  assert.ok(content.includes('class: className'), 'Should accept custom class prop');
  assert.ok(content.includes('className'), 'Should use className in computed classes');
});

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
