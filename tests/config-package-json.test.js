import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const configPackageJsonPath = join(rootDir, 'packages', 'config', 'package.json');

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

console.log('\n=== packages/config/package.json Tests ===\n');

test('packages/config/package.json exists', () => {
  assert.ok(existsSync(configPackageJsonPath), 'packages/config/package.json should exist');
});

let packageJson;
test('packages/config/package.json is valid JSON', () => {
  const content = readFileSync(configPackageJsonPath, 'utf-8');
  packageJson = JSON.parse(content);
  assert.ok(packageJson, 'Should parse as valid JSON');
});

test('package name is @kaivalo/config', () => {
  assert.strictEqual(packageJson.name, '@kaivalo/config', 'Name should be @kaivalo/config');
});

test('package type is module', () => {
  assert.strictEqual(packageJson.type, 'module', 'Type should be module');
});

test('package has version', () => {
  assert.ok(packageJson.version, 'Should have a version');
});

test('package has main entry point', () => {
  assert.ok(packageJson.main, 'Should have a main entry point');
  assert.strictEqual(packageJson.main, 'tailwind.preset.js', 'Main should be tailwind.preset.js');
});

test('package has exports', () => {
  assert.ok(packageJson.exports, 'Should have exports field');
  assert.ok(packageJson.exports['.'], 'Should export main entry');
});

test('package exports tailwind.preset.js', () => {
  const hasPresetExport =
    packageJson.exports['./tailwind.preset'] ||
    packageJson.exports['./tailwind.preset.js'] ||
    packageJson.exports['.']?.includes('tailwind.preset');
  assert.ok(hasPresetExport || packageJson.exports['.'] === './tailwind.preset.js',
    'Should export tailwind.preset.js');
});

test('package has peerDependencies', () => {
  assert.ok(packageJson.peerDependencies, 'Should have peerDependencies');
});

test('tailwindcss is a peer dependency', () => {
  assert.ok(packageJson.peerDependencies.tailwindcss, 'TailwindCSS should be a peer dependency');
});

test('package has description', () => {
  assert.ok(packageJson.description, 'Should have a description');
  assert.ok(packageJson.description.includes('config') || packageJson.description.includes('Tailwind'),
    'Description should mention config or Tailwind');
});

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
