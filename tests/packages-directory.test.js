/**
 * Tests for packages/ directory structure
 */

import { existsSync, statSync } from 'fs';
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

// Test 1: packages/ directory exists
allPassed = test('packages/ directory exists', () => {
  const packagesPath = join(rootDir, 'packages');
  assert(existsSync(packagesPath), 'packages/ directory should exist');
}) && allPassed;

// Test 2: packages/ is a directory (not a file)
allPassed = test('packages/ is a directory', () => {
  const packagesPath = join(rootDir, 'packages');
  const stats = statSync(packagesPath);
  assert(stats.isDirectory(), 'packages/ should be a directory, not a file');
}) && allPassed;

// Test 3: packages/ has .gitkeep file (for git tracking)
allPassed = test('packages/ has .gitkeep file', () => {
  const gitkeepPath = join(rootDir, 'packages', '.gitkeep');
  assert(existsSync(gitkeepPath), 'packages/.gitkeep should exist for git tracking');
}) && allPassed;

// Test 4: packages/ is at correct location relative to root
allPassed = test('packages/ is in monorepo root', () => {
  const packageJsonPath = join(rootDir, 'package.json');
  const packagesPath = join(rootDir, 'packages');
  assert(existsSync(packageJsonPath), 'package.json should exist in root');
  assert(existsSync(packagesPath), 'packages/ should be in same directory as package.json');
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
