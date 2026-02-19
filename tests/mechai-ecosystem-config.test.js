/**
 * Test: MechanicAI ecosystem.config.cjs
 * Validates PM2 configuration for mechai service.
 * Skips all tests if mechanic-ai directory is not present.
 */

import { existsSync } from 'fs';
import { resolve, join } from 'path';

const mechaiDir = join(resolve(import.meta.dirname, '..'), 'apps', 'mechai');
const ecosystemConfigPath = `${mechaiDir}/ecosystem.config.cjs`;

if (!existsSync(mechaiDir)) {
  console.log('\n--- MechanicAI Ecosystem Config Tests ---\n');
  console.log('- All tests skipped (mechanic-ai directory not present)');
  console.log('\n0 passed, 0 failed (12 skipped)\n');
  process.exit(0);
}

// Only run tests if directory exists
import { readFileSync } from 'fs';
import assert from 'assert';

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      await t.fn();
      console.log(`✓ ${t.name}`);
      passed++;
    } catch (error) {
      console.log(`✗ ${t.name}`);
      console.log(`  Error: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

test('mechai ecosystem.config.cjs exists', () => {
  assert.ok(existsSync(ecosystemConfigPath), 'ecosystem.config.cjs should exist');
});

test('mechai ecosystem.config.cjs is readable', () => {
  const content = readFileSync(ecosystemConfigPath, 'utf-8');
  assert.ok(content.length > 0, 'ecosystem.config.cjs should not be empty');
});

test('uses CommonJS module.exports syntax', () => {
  const content = readFileSync(ecosystemConfigPath, 'utf-8');
  assert.ok(content.includes('module.exports'), 'should use module.exports');
});

test('has apps array', () => {
  const content = readFileSync(ecosystemConfigPath, 'utf-8');
  assert.ok(content.includes('apps:'), 'should have apps property');
  assert.ok(content.includes('['), 'apps should be an array');
});

test('app name is mechai', () => {
  const content = readFileSync(ecosystemConfigPath, 'utf-8');
  assert.ok(content.includes("name: 'mechai'") || content.includes('name: "mechai"'),
    'app name should be mechai');
});

test('script points to build/index.js', () => {
  const content = readFileSync(ecosystemConfigPath, 'utf-8');
  assert.ok(content.includes("script: 'build/index.js'") || content.includes('script: "build/index.js"'),
    'script should be build/index.js');
});

test('has env configuration', () => {
  const content = readFileSync(ecosystemConfigPath, 'utf-8');
  assert.ok(content.includes('env:'), 'should have env property');
});

test('PORT is set to 3101', () => {
  const content = readFileSync(ecosystemConfigPath, 'utf-8');
  assert.ok(content.includes('PORT: 3101') || content.includes('PORT:3101'),
    'PORT should be 3101');
});

test('NODE_ENV is set to production', () => {
  const content = readFileSync(ecosystemConfigPath, 'utf-8');
  assert.ok(content.includes("NODE_ENV: 'production'") || content.includes('NODE_ENV: "production"'),
    'NODE_ENV should be production');
});

test('config can be required and has correct structure', async () => {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const config = require(ecosystemConfigPath);

  assert.ok(Array.isArray(config.apps), 'apps should be an array');
  assert.strictEqual(config.apps.length, 1, 'should have exactly one app');
});

test('app has all required fields', async () => {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const config = require(ecosystemConfigPath);

  const app = config.apps[0];
  assert.strictEqual(app.name, 'mechai', 'name should be mechai');
  assert.strictEqual(app.script, 'build/index.js', 'script should be build/index.js');
  assert.ok(app.env, 'should have env object');
  assert.strictEqual(app.env.PORT, 3101, 'PORT should be 3101');
  assert.strictEqual(app.env.NODE_ENV, 'production', 'NODE_ENV should be production');
});

test('file has .cjs extension for CommonJS compatibility', () => {
  assert.ok(ecosystemConfigPath.endsWith('.cjs'), 'should have .cjs extension');
});

runTests();
