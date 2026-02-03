/**
 * Tests for mechai symlink (apps/mechai -> mechanic-ai)
 */

import { existsSync, lstatSync, readlinkSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    return false;
  }
}

let allPassed = true;

// Test 1: apps/mechai exists
allPassed = test('apps/mechai exists', () => {
  const mechaiPath = join(rootDir, 'apps', 'mechai');
  assert(existsSync(mechaiPath), 'apps/mechai should exist');
}) && allPassed;

// Test 2: apps/mechai is a symlink
allPassed = test('apps/mechai is a symlink', () => {
  const mechaiPath = join(rootDir, 'apps', 'mechai');
  const stats = lstatSync(mechaiPath);
  assert(stats.isSymbolicLink(), 'apps/mechai should be a symlink');
}) && allPassed;

// Test 3: symlink points to correct target
allPassed = test('symlink points to /home/kai/pets/mechanic-ai', () => {
  const mechaiPath = join(rootDir, 'apps', 'mechai');
  const target = readlinkSync(mechaiPath);
  assert.strictEqual(target, '/home/kai/pets/mechanic-ai', 'symlink should point to /home/kai/pets/mechanic-ai');
}) && allPassed;

// Test 4: symlink target directory exists and is accessible
allPassed = test('symlink target is accessible', () => {
  const mechaiPath = join(rootDir, 'apps', 'mechai');
  // existsSync follows symlinks, so this verifies the target exists
  assert(existsSync(mechaiPath), 'symlink target should be accessible');
}) && allPassed;

// Test 5: symlink target contains expected mechanic-ai files
allPassed = test('symlink target contains package.json (mechanic-ai)', () => {
  const packageJsonPath = join(rootDir, 'apps', 'mechai', 'package.json');
  assert(existsSync(packageJsonPath), 'mechanic-ai should have a package.json');
}) && allPassed;

// Test 6: symlink target contains svelte.config.js (SvelteKit project)
allPassed = test('symlink target contains svelte.config.js', () => {
  const svelteConfigPath = join(rootDir, 'apps', 'mechai', 'svelte.config.js');
  assert(existsSync(svelteConfigPath), 'mechanic-ai should have svelte.config.js');
}) && allPassed;

// Summary
console.log('');
if (allPassed) {
  console.log('All tests passed!');
  process.exit(0);
} else {
  console.log('Some tests failed!');
  process.exit(1);
}
