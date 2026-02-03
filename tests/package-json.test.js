/**
 * Tests for root package.json workspace configuration
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

// Test 1: package.json exists
allPassed = test('package.json exists', () => {
  const packagePath = join(rootDir, 'package.json');
  assert(existsSync(packagePath), 'package.json should exist in root directory');
}) && allPassed;

// Test 2: package.json is valid JSON
let pkg;
allPassed = test('package.json is valid JSON', () => {
  const packagePath = join(rootDir, 'package.json');
  const content = readFileSync(packagePath, 'utf-8');
  pkg = JSON.parse(content);
  assert(typeof pkg === 'object', 'package.json should parse to an object');
}) && allPassed;

// Test 3: Has name field
allPassed = test('has name field', () => {
  assert(pkg.name === 'kaivalo', `name should be "kaivalo", got "${pkg.name}"`);
}) && allPassed;

// Test 4: Is marked as private
allPassed = test('is marked as private', () => {
  assert(pkg.private === true, 'private should be true for monorepo root');
}) && allPassed;

// Test 5: Has workspaces configuration
allPassed = test('has workspaces configuration', () => {
  assert(Array.isArray(pkg.workspaces), 'workspaces should be an array');
}) && allPassed;

// Test 6: Workspaces includes apps/*
allPassed = test('workspaces includes apps/*', () => {
  assert(pkg.workspaces.includes('apps/*'), 'workspaces should include "apps/*"');
}) && allPassed;

// Test 7: Workspaces includes packages/*
allPassed = test('workspaces includes packages/*', () => {
  assert(pkg.workspaces.includes('packages/*'), 'workspaces should include "packages/*"');
}) && allPassed;

// Test 8: Has version field
allPassed = test('has version field', () => {
  assert(typeof pkg.version === 'string', 'version should be a string');
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
