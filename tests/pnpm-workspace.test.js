/**
 * Tests for pnpm-workspace.yaml configuration
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

// Test 1: pnpm-workspace.yaml exists
allPassed = test('pnpm-workspace.yaml exists', () => {
  const workspacePath = join(rootDir, 'pnpm-workspace.yaml');
  assert(existsSync(workspacePath), 'pnpm-workspace.yaml should exist in root directory');
}) && allPassed;

// Test 2: pnpm-workspace.yaml contains packages key
let content;
allPassed = test('pnpm-workspace.yaml contains packages key', () => {
  const workspacePath = join(rootDir, 'pnpm-workspace.yaml');
  content = readFileSync(workspacePath, 'utf-8');
  assert(content.includes('packages:'), 'should contain "packages:" key');
}) && allPassed;

// Test 3: Includes apps/* workspace
allPassed = test('includes apps/* workspace', () => {
  assert(content.includes("'apps/*'") || content.includes('"apps/*"') || content.includes('- apps/*'),
    'should include apps/* in packages list');
}) && allPassed;

// Test 4: Includes packages/* workspace
allPassed = test('includes packages/* workspace', () => {
  assert(content.includes("'packages/*'") || content.includes('"packages/*"') || content.includes('- packages/*'),
    'should include packages/* in packages list');
}) && allPassed;

// Test 5: Is valid YAML format (basic structure check)
allPassed = test('has valid YAML structure', () => {
  const lines = content.trim().split('\n');
  assert(lines.length >= 3, 'should have at least 3 lines (packages key + 2 entries)');
  assert(lines[0].startsWith('packages'), 'first line should start with packages');
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
