import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert';

const require = createRequire(import.meta.url);

// Run all tests
// File paths
const projectRoot = resolve(import.meta.dirname, '..');
const ecosystemConfigPath = join(projectRoot, 'apps/hub/ecosystem.config.cjs');
// Test: ecosystem.config.cjs exists

describe('hub ecosystem config', () => {
  it('ecosystem.config.cjs exists', () => {
    assert.ok(existsSync(ecosystemConfigPath), 'ecosystem.config.cjs should exist');
  });

  it('ecosystem.config.cjs is readable', () => {
    const content = readFileSync(ecosystemConfigPath, 'utf-8');
    assert.ok(content.length > 0, 'ecosystem.config.cjs should not be empty');
  });

  it('uses CommonJS module.exports syntax', () => {
    const content = readFileSync(ecosystemConfigPath, 'utf-8');
    assert.ok(content.includes('module.exports'), 'should use module.exports');
  });

  it('has apps array', () => {
    const content = readFileSync(ecosystemConfigPath, 'utf-8');
    assert.ok(content.includes('apps:'), 'should have apps property');
    assert.ok(content.includes('['), 'apps should be an array');
  });

  it('app name is kaivalo-hub', () => {
    const content = readFileSync(ecosystemConfigPath, 'utf-8');
    assert.ok(content.includes("name: 'kaivalo-hub'") || content.includes('name: "kaivalo-hub"'),
    'app name should be kaivalo-hub');
  });

  it('script points to build/index.js', () => {
    const content = readFileSync(ecosystemConfigPath, 'utf-8');
    assert.ok(content.includes("script: 'build/index.js'") || content.includes('script: "build/index.js"'),
    'script should be build/index.js');
  });

  it('has env configuration', () => {
    const content = readFileSync(ecosystemConfigPath, 'utf-8');
    assert.ok(content.includes('env:'), 'should have env property');
  });

  it('PORT is set to 3100', () => {
    const content = readFileSync(ecosystemConfigPath, 'utf-8');
    assert.ok(content.includes("PORT: '3100'") || content.includes('PORT: "3100"'),
    'PORT should be 3100 (string, since PM2 passes env vars as strings)');
  });

  it('NODE_ENV is set to production', () => {
    const content = readFileSync(ecosystemConfigPath, 'utf-8');
    assert.ok(content.includes("NODE_ENV: 'production'") || content.includes('NODE_ENV: "production"'),
    'NODE_ENV should be production');
  });

  it('config can be required and has correct structure', () => {
    const config = require(ecosystemConfigPath);

    assert.ok(Array.isArray(config.apps), 'apps should be an array');
    assert.strictEqual(config.apps.length, 1, 'should have exactly one app');
  });

  it('app has all required fields', () => {
    const config = require(ecosystemConfigPath);

    const app = config.apps[0];
    assert.strictEqual(app.name, 'kaivalo-hub', 'name should be kaivalo-hub');
    assert.strictEqual(app.script, 'build/index.js', 'script should be build/index.js');
    assert.ok(app.env, 'should have env object');
    assert.strictEqual(app.env.PORT, '3100', 'PORT should be 3100 (string)');
    assert.strictEqual(app.env.NODE_ENV, 'production', 'NODE_ENV should be production');
  });

  it('file has .cjs extension for CommonJS compatibility', () => {
    assert.ok(ecosystemConfigPath.endsWith('.cjs'), 'should have .cjs extension');
  });
});
