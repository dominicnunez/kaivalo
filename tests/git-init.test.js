/**
 * Tests for git repository initialization
 */

import { existsSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
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

// Test 1: .git directory exists
allPassed = test('.git directory exists', () => {
  const gitDir = join(rootDir, '.git');
  assert(existsSync(gitDir), '.git directory should exist');
}) && allPassed;

// Test 2: .git is a directory
allPassed = test('.git is a directory', () => {
  const gitDir = join(rootDir, '.git');
  const stat = statSync(gitDir);
  assert(stat.isDirectory(), '.git should be a directory');
}) && allPassed;

// Test 3: git repo is valid (rev-parse works)
allPassed = test('git repo is valid', () => {
  const result = execSync('git rev-parse --is-inside-work-tree', {
    cwd: rootDir,
    encoding: 'utf-8'
  }).trim();
  assert(result === 'true', 'should be inside a git work tree');
}) && allPassed;

// Test 4: git root is at correct location
allPassed = test('git root is at correct location', () => {
  const result = execSync('git rev-parse --show-toplevel', {
    cwd: rootDir,
    encoding: 'utf-8'
  }).trim();
  assert(result === rootDir, `git root should be ${rootDir}, got ${result}`);
}) && allPassed;

// Test 5: main branch exists
allPassed = test('main branch exists', () => {
  const result = execSync('git branch --show-current', {
    cwd: rootDir,
    encoding: 'utf-8'
  }).trim();
  assert(result === 'main', `current branch should be "main", got "${result}"`);
}) && allPassed;

// Test 6: has at least one commit
allPassed = test('has at least one commit', () => {
  const result = execSync('git rev-parse HEAD', {
    cwd: rootDir,
    encoding: 'utf-8'
  }).trim();
  assert(result.length === 40, 'HEAD should point to a valid commit hash');
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
