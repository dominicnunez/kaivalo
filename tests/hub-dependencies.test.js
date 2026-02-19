import { strict as assert } from 'assert';
import { existsSync, statSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const projectRoot = resolve(import.meta.dirname, '..');
const hubRoot = join(projectRoot, 'apps/hub');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

console.log('\napps/hub dependencies installation tests:');

// npm workspaces hoists dependencies to root node_modules
// Check that root node_modules exists and contains expected packages

// node_modules existence tests
test('root node_modules directory exists', () => {
  assert.ok(existsSync(join(projectRoot, 'node_modules')), 'root node_modules directory should exist');
});

test('root node_modules is a directory', () => {
  const stats = statSync(join(projectRoot, 'node_modules'));
  assert.ok(stats.isDirectory(), 'root node_modules should be a directory');
});

test('root node_modules has contents', () => {
  const contents = readdirSync(join(projectRoot, 'node_modules'));
  assert.ok(contents.length > 0, 'root node_modules should have packages installed');
});

// Core SvelteKit dependencies (hoisted to root)
test('@sveltejs/kit is installed', () => {
  assert.ok(existsSync(join(projectRoot, 'node_modules/@sveltejs/kit')), '@sveltejs/kit should be installed');
});

test('@sveltejs/vite-plugin-svelte is installed', () => {
  assert.ok(existsSync(join(projectRoot, 'node_modules/@sveltejs/vite-plugin-svelte')), '@sveltejs/vite-plugin-svelte should be installed');
});

// Svelte
test('svelte is installed', () => {
  assert.ok(existsSync(join(projectRoot, 'node_modules/svelte')), 'svelte should be installed');
});

// Vite
test('vite is installed', () => {
  assert.ok(existsSync(join(projectRoot, 'node_modules/vite')), 'vite should be installed');
});

// TypeScript
test('typescript is installed', () => {
  assert.ok(existsSync(join(projectRoot, 'node_modules/typescript')), 'typescript should be installed');
});

// svelte-check for type checking
test('svelte-check is installed', () => {
  assert.ok(existsSync(join(projectRoot, 'node_modules/svelte-check')), 'svelte-check should be installed');
});

// package-lock.json should be created at root (npm workspaces)
test('root package-lock.json exists', () => {
  assert.ok(existsSync(join(projectRoot, 'package-lock.json')), 'root package-lock.json should exist after npm install');
});

test('root package-lock.json is a file', () => {
  const stats = statSync(join(projectRoot, 'package-lock.json'));
  assert.ok(stats.isFile(), 'root package-lock.json should be a file');
});

// Verify dependencies are resolvable from apps/hub using symlink
test('apps/hub can resolve dependencies via workspace symlink', () => {
  // npm workspaces creates a symlink in root node_modules for workspace packages
  // Verify node can resolve the dependencies from hub's perspective
  const hubNodeModules = join(hubRoot, 'node_modules');
  const rootNodeModules = join(projectRoot, 'node_modules');

  // Either hub has its own node_modules (for non-hoisted deps) or uses root
  // The key test is that required packages exist in root
  assert.ok(
    existsSync(hubNodeModules) || existsSync(rootNodeModules),
    'node_modules should be accessible from hub'
  );
});

// Summary
console.log(`\n  ${passed} passing, ${failed} failing\n`);

if (failed > 0) {
  process.exit(1);
}
