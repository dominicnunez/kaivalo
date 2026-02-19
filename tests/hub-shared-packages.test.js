import assert from 'node:assert';
import { existsSync, lstatSync, readlinkSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const nodeModulesKaivalo = join(projectRoot, 'node_modules', '@kaivalo');
const hubPackageJson = join(projectRoot, 'apps', 'hub', 'package.json');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
    failed++;
  }
}

console.log('\n📦 Testing shared packages installation in apps/hub...\n');

// Test @kaivalo scope directory exists
test('@kaivalo scope directory exists in node_modules', () => {
  assert.ok(existsSync(nodeModulesKaivalo), '@kaivalo directory should exist');
});

// Test @kaivalo/ui symlink
test('@kaivalo/ui package is symlinked', () => {
  const uiPath = join(nodeModulesKaivalo, 'ui');
  assert.ok(existsSync(uiPath), '@kaivalo/ui should exist');
});

test('@kaivalo/ui is a symbolic link', () => {
  const uiPath = join(nodeModulesKaivalo, 'ui');
  const stats = lstatSync(uiPath);
  assert.ok(stats.isSymbolicLink(), '@kaivalo/ui should be a symlink');
});

test('@kaivalo/ui symlink points to packages/ui', () => {
  const uiPath = join(nodeModulesKaivalo, 'ui');
  const target = readlinkSync(uiPath);
  assert.ok(target.includes('packages/ui'), `Expected symlink to point to packages/ui, got ${target}`);
});

test('@kaivalo/ui has package.json with correct name', () => {
  const uiPath = join(nodeModulesKaivalo, 'ui');
  const pkgPath = join(uiPath, 'package.json');
  assert.ok(existsSync(pkgPath), 'package.json should exist in @kaivalo/ui');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  assert.strictEqual(pkg.name, '@kaivalo/ui', 'package name should be @kaivalo/ui');
});

test('@kaivalo/ui has index.js', () => {
  const uiPath = join(nodeModulesKaivalo, 'ui');
  const indexPath = join(uiPath, 'index.js');
  assert.ok(existsSync(indexPath), 'index.js should exist in @kaivalo/ui');
});

test('@kaivalo/ui has Button.svelte component', () => {
  const uiPath = join(nodeModulesKaivalo, 'ui');
  const componentPath = join(uiPath, 'Button.svelte');
  assert.ok(existsSync(componentPath), 'Button.svelte should exist');
});

test('@kaivalo/ui has Card.svelte component', () => {
  const uiPath = join(nodeModulesKaivalo, 'ui');
  const componentPath = join(uiPath, 'Card.svelte');
  assert.ok(existsSync(componentPath), 'Card.svelte should exist');
});

test('@kaivalo/ui has Badge.svelte component', () => {
  const uiPath = join(nodeModulesKaivalo, 'ui');
  const componentPath = join(uiPath, 'Badge.svelte');
  assert.ok(existsSync(componentPath), 'Badge.svelte should exist');
});

test('@kaivalo/ui has Container.svelte component', () => {
  const uiPath = join(nodeModulesKaivalo, 'ui');
  const componentPath = join(uiPath, 'Container.svelte');
  assert.ok(existsSync(componentPath), 'Container.svelte should exist');
});

// Test hub package.json has dependencies declared
test('apps/hub/package.json exists', () => {
  assert.ok(existsSync(hubPackageJson), 'hub package.json should exist');
});

test('apps/hub/package.json has @kaivalo/ui dependency', () => {
  const pkg = JSON.parse(readFileSync(hubPackageJson, 'utf8'));
  assert.ok(pkg.dependencies, 'dependencies should exist');
  assert.ok('@kaivalo/ui' in pkg.dependencies, '@kaivalo/ui should be in dependencies');
});

test('@kaivalo/ui dependency uses workspace version (*)', () => {
  const pkg = JSON.parse(readFileSync(hubPackageJson, 'utf8'));
  assert.strictEqual(pkg.dependencies['@kaivalo/ui'], '*', '@kaivalo/ui should use * (workspace link)');
});

console.log(`\n  ${passed} passing, ${failed} failing\n`);
process.exit(failed > 0 ? 1 : 0);
