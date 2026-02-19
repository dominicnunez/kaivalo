/**
 * Tests for mechai symlink (apps/mechai -> mechanic-ai)
 * Note: Tests that require the symlink target to be present are skipped
 * if the apps/mechai symlink target doesn't exist (may be on another machine).
 */

import { existsSync, lstatSync, readlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const mechaiPath = join(rootDir, 'apps', 'mechai');
const targetExists = existsSync(join(rootDir, 'apps', 'mechai'));

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

function skip(name, reason) {
  console.log(`- ${name} (skipped: ${reason})`);
  return true;
}

let allPassed = true;

// Test 1: apps/mechai symlink entry exists (lstat doesn't follow symlinks)
allPassed = test('apps/mechai symlink entry exists', () => {
  const stats = lstatSync(mechaiPath);
  assert(stats, 'apps/mechai should exist as a filesystem entry');
}) && allPassed;

// Test 2: apps/mechai is a symlink
allPassed = test('apps/mechai is a symlink', () => {
  const stats = lstatSync(mechaiPath);
  assert(stats.isSymbolicLink(), 'apps/mechai should be a symlink');
}) && allPassed;

// Test 3-6: These require the symlink target directory to exist
if (targetExists) {
  allPassed = test('symlink target is a valid path', () => {
    const target = readlinkSync(mechaiPath);
    assert.ok(existsSync(target), `symlink target ${target} should exist`);
  }) && allPassed;
  allPassed = test('symlink target is accessible', () => {
    assert(existsSync(mechaiPath), 'symlink target should be accessible');
  }) && allPassed;

  allPassed = test('symlink target contains package.json (mechanic-ai)', () => {
    const packageJsonPath = join(mechaiPath, 'package.json');
    assert(existsSync(packageJsonPath), 'mechanic-ai should have a package.json');
  }) && allPassed;

  allPassed = test('symlink target contains svelte.config.js', () => {
    const svelteConfigPath = join(mechaiPath, 'svelte.config.js');
    assert(existsSync(svelteConfigPath), 'mechanic-ai should have svelte.config.js');
  }) && allPassed;
} else {
  skip('symlink target is a valid path', 'mechanic-ai directory not present');
  skip('symlink target is accessible', 'mechanic-ai directory not present');
  skip('symlink target contains package.json', 'mechanic-ai directory not present');
  skip('symlink target contains svelte.config.js', 'mechanic-ai directory not present');
}

// Summary
console.log('');
if (allPassed) {
  console.log('All tests passed!');
  process.exit(0);
} else {
  console.log('Some tests failed!');
  process.exit(1);
}
