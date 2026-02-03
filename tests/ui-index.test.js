import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const uiIndexPath = join(rootDir, 'packages', 'ui', 'index.js');

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

console.log('\n=== packages/ui/index.js Tests ===\n');

test('packages/ui/index.js exists', () => {
  assert.ok(existsSync(uiIndexPath), 'packages/ui/index.js should exist');
});

let indexContent;
test('packages/ui/index.js is readable', () => {
  indexContent = readFileSync(uiIndexPath, 'utf-8');
  assert.ok(indexContent, 'Should be able to read index.js');
});

test('index.js exports Button component', () => {
  assert.ok(indexContent.includes("from './Button.svelte'"), 'Should export Button.svelte');
  assert.ok(indexContent.includes('Button'), 'Should have Button export');
});

test('index.js exports Card component', () => {
  assert.ok(indexContent.includes("from './Card.svelte'"), 'Should export Card.svelte');
  assert.ok(indexContent.includes('Card'), 'Should have Card export');
});

test('index.js exports Badge component', () => {
  assert.ok(indexContent.includes("from './Badge.svelte'"), 'Should export Badge.svelte');
  assert.ok(indexContent.includes('Badge'), 'Should have Badge export');
});

test('index.js exports Container component', () => {
  assert.ok(indexContent.includes("from './Container.svelte'"), 'Should export Container.svelte');
  assert.ok(indexContent.includes('Container'), 'Should have Container export');
});

test('index.js uses ES module export syntax', () => {
  assert.ok(indexContent.includes('export {'), 'Should use ES module export syntax');
});

test('index.js exports all four components', () => {
  const exports = ['Button', 'Card', 'Badge', 'Container'];
  for (const component of exports) {
    assert.ok(indexContent.includes(component), `Should export ${component}`);
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
