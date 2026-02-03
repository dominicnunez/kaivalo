import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const uiPackageJsonPath = join(rootDir, 'packages', 'ui', 'package.json');

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

console.log('\n=== packages/ui/package.json Tests ===\n');

test('packages/ui/package.json exists', () => {
  assert.ok(existsSync(uiPackageJsonPath), 'packages/ui/package.json should exist');
});

let packageJson;
test('packages/ui/package.json is valid JSON', () => {
  const content = readFileSync(uiPackageJsonPath, 'utf-8');
  packageJson = JSON.parse(content);
  assert.ok(packageJson, 'Should parse as valid JSON');
});

test('package name is @kaivalo/ui', () => {
  assert.strictEqual(packageJson.name, '@kaivalo/ui', 'Name should be @kaivalo/ui');
});

test('package type is module', () => {
  assert.strictEqual(packageJson.type, 'module', 'Type should be module');
});

test('package has version', () => {
  assert.ok(packageJson.version, 'Should have a version');
});

test('package has main entry point', () => {
  assert.ok(packageJson.main, 'Should have a main entry point');
  assert.strictEqual(packageJson.main, './index.js', 'Main should be ./index.js');
});

test('package has exports', () => {
  assert.ok(packageJson.exports, 'Should have exports field');
  assert.ok(packageJson.exports['.'], 'Should export main entry');
});

test('package has peerDependencies', () => {
  assert.ok(packageJson.peerDependencies, 'Should have peerDependencies');
});

test('svelte is a peer dependency', () => {
  assert.ok(packageJson.peerDependencies.svelte, 'Svelte should be a peer dependency');
  assert.ok(packageJson.peerDependencies.svelte.includes('^5'), 'Svelte peer dep should be ^5.x');
});

test('tailwindcss is a peer dependency', () => {
  assert.ok(packageJson.peerDependencies.tailwindcss, 'TailwindCSS should be a peer dependency');
});

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
