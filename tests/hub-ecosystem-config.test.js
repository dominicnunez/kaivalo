import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import assert from 'assert';

// Test helper function
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// Run all tests
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

// File paths
const projectRoot = resolve(import.meta.dirname, '..');
const ecosystemConfigPath = join(projectRoot, 'apps/hub/ecosystem.config.cjs');

// Test: ecosystem.config.cjs exists
test('ecosystem.config.cjs exists', () => {
  assert.ok(existsSync(ecosystemConfigPath), 'ecosystem.config.cjs should exist');
});

// Test: ecosystem.config.cjs is readable
test('ecosystem.config.cjs is readable', () => {
  const content = readFileSync(ecosystemConfigPath, 'utf-8');
  assert.ok(content.length > 0, 'ecosystem.config.cjs should not be empty');
});

// Test: uses CommonJS module.exports
test('uses CommonJS module.exports syntax', () => {
  const content = readFileSync(ecosystemConfigPath, 'utf-8');
  assert.ok(content.includes('module.exports'), 'should use module.exports');
});

// Test: has apps array
test('has apps array', () => {
  const content = readFileSync(ecosystemConfigPath, 'utf-8');
  assert.ok(content.includes('apps:'), 'should have apps property');
  assert.ok(content.includes('['), 'apps should be an array');
});

// Test: app name is kaivalo-hub
test('app name is kaivalo-hub', () => {
  const content = readFileSync(ecosystemConfigPath, 'utf-8');
  assert.ok(content.includes("name: 'kaivalo-hub'") || content.includes('name: "kaivalo-hub"'),
    'app name should be kaivalo-hub');
});

// Test: script points to build/index.js
test('script points to build/index.js', () => {
  const content = readFileSync(ecosystemConfigPath, 'utf-8');
  assert.ok(content.includes("script: 'build/index.js'") || content.includes('script: "build/index.js"'),
    'script should be build/index.js');
});

// Test: has env configuration
test('has env configuration', () => {
  const content = readFileSync(ecosystemConfigPath, 'utf-8');
  assert.ok(content.includes('env:'), 'should have env property');
});

// Test: PORT is 3100
test('PORT is set to 3100', () => {
  const content = readFileSync(ecosystemConfigPath, 'utf-8');
  assert.ok(content.includes('PORT: 3100') || content.includes('PORT:3100'),
    'PORT should be 3100');
});

// Test: NODE_ENV is production
test('NODE_ENV is set to production', () => {
  const content = readFileSync(ecosystemConfigPath, 'utf-8');
  assert.ok(content.includes("NODE_ENV: 'production'") || content.includes('NODE_ENV: "production"'),
    'NODE_ENV should be production');
});

// Test: config can be imported (runtime validation)
test('config can be required and has correct structure', async () => {
  // Use dynamic import with createRequire for .cjs file
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const config = require(ecosystemConfigPath);

  assert.ok(Array.isArray(config.apps), 'apps should be an array');
  assert.strictEqual(config.apps.length, 1, 'should have exactly one app');
});

// Test: app configuration has all required fields
test('app has all required fields', async () => {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);
  const config = require(ecosystemConfigPath);

  const app = config.apps[0];
  assert.strictEqual(app.name, 'kaivalo-hub', 'name should be kaivalo-hub');
  assert.strictEqual(app.script, 'build/index.js', 'script should be build/index.js');
  assert.ok(app.env, 'should have env object');
  assert.strictEqual(app.env.PORT, 3100, 'PORT should be 3100');
  assert.strictEqual(app.env.NODE_ENV, 'production', 'NODE_ENV should be production');
});

// Test: file has .cjs extension (for CommonJS)
test('file has .cjs extension for CommonJS compatibility', () => {
  assert.ok(ecosystemConfigPath.endsWith('.cjs'), 'should have .cjs extension');
});

// Run tests
runTests();
