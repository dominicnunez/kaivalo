/**
 * Tests for apps/ directory structure
 */

import { existsSync, statSync, readdirSync } from 'fs';
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

// Test 1: apps/ directory exists
allPassed = test('apps/ directory exists', () => {
  const appsPath = join(rootDir, 'apps');
  assert(existsSync(appsPath), 'apps/ directory should exist');
}) && allPassed;

// Test 2: apps/ is a directory (not a file)
allPassed = test('apps/ is a directory', () => {
  const appsPath = join(rootDir, 'apps');
  const stats = statSync(appsPath);
  assert(stats.isDirectory(), 'apps/ should be a directory, not a file');
}) && allPassed;

// Test 3: apps/ has .gitkeep file (for git tracking)
allPassed = test('apps/ has .gitkeep file', () => {
  const gitkeepPath = join(rootDir, 'apps', '.gitkeep');
  assert(existsSync(gitkeepPath), 'apps/.gitkeep should exist for git tracking');
}) && allPassed;

// Test 4: apps/ is at correct location relative to root
allPassed = test('apps/ is in monorepo root', () => {
  const packageJsonPath = join(rootDir, 'package.json');
  const appsPath = join(rootDir, 'apps');
  assert(existsSync(packageJsonPath), 'package.json should exist in root');
  assert(existsSync(appsPath), 'apps/ should be in same directory as package.json');
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
