/**
 * Tests for .gitignore configuration
 */

import { readFileSync, existsSync } from 'fs';
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
let content;

// Test 1: .gitignore exists
allPassed = test('.gitignore exists', () => {
  const filePath = join(rootDir, '.gitignore');
  assert(existsSync(filePath), '.gitignore should exist in root directory');
  content = readFileSync(filePath, 'utf-8');
}) && allPassed;

// Test 2: Ignores node_modules
allPassed = test('ignores node_modules', () => {
  assert(/^node_modules\/?$/m.test(content), 'should ignore node_modules');
}) && allPassed;

// Test 3: Ignores .env
allPassed = test('ignores .env', () => {
  assert(/^\.env$/m.test(content), 'should ignore .env');
}) && allPassed;

// Test 4: Ignores build directory
allPassed = test('ignores build directory', () => {
  assert(/^build\/?$/m.test(content), 'should ignore build directory');
}) && allPassed;

// Test 5: Ignores .svelte-kit
allPassed = test('ignores .svelte-kit', () => {
  assert(/^\.svelte-kit\/?$/m.test(content), 'should ignore .svelte-kit');
}) && allPassed;

// Test 6: Has multiple entries
allPassed = test('has multiple entries', () => {
  const lines = content.split('\n').filter(line =>
    line.trim() && !line.startsWith('#')
  );
  assert(lines.length >= 4, `should have at least 4 entries, got ${lines.length}`);
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
