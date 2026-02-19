import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';

const mechaiDir = join(resolve(import.meta.dirname, '..'), 'apps', 'mechai');
const ecosystemConfigPath = `${mechaiDir}/ecosystem.config.cjs`;
const skip = !existsSync(mechaiDir);

describe('MechanicAI ecosystem.config.cjs', { skip: skip && 'mechanic-ai directory not present' }, () => {
  it('mechai ecosystem.config.cjs exists', () => {
    assert.ok(existsSync(ecosystemConfigPath), 'ecosystem.config.cjs should exist');
  });

  it('mechai ecosystem.config.cjs is readable', () => {
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

  it('app name is mechai', () => {
    const content = readFileSync(ecosystemConfigPath, 'utf-8');
    assert.ok(content.includes("name: 'mechai'") || content.includes('name: "mechai"'),
      'app name should be mechai');
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

  it('PORT is set to 3101', () => {
    const content = readFileSync(ecosystemConfigPath, 'utf-8');
    assert.ok(content.includes('PORT: 3101') || content.includes('PORT:3101'),
      'PORT should be 3101');
  });

  it('NODE_ENV is set to production', () => {
    const content = readFileSync(ecosystemConfigPath, 'utf-8');
    assert.ok(content.includes("NODE_ENV: 'production'") || content.includes('NODE_ENV: "production"'),
      'NODE_ENV should be production');
  });

  it('config can be required and has correct structure', () => {
    const require = createRequire(import.meta.url);
    const config = require(ecosystemConfigPath);

    assert.ok(Array.isArray(config.apps), 'apps should be an array');
    assert.strictEqual(config.apps.length, 1, 'should have exactly one app');
  });

  it('app has all required fields', () => {
    const require = createRequire(import.meta.url);
    const config = require(ecosystemConfigPath);

    const app = config.apps[0];
    assert.strictEqual(app.name, 'mechai', 'name should be mechai');
    assert.strictEqual(app.script, 'build/index.js', 'script should be build/index.js');
    assert.ok(app.env, 'should have env object');
    assert.strictEqual(app.env.PORT, 3101, 'PORT should be 3101');
    assert.strictEqual(app.env.NODE_ENV, 'production', 'NODE_ENV should be production');
  });

  it('file has .cjs extension for CommonJS compatibility', () => {
    assert.ok(ecosystemConfigPath.endsWith('.cjs'), 'should have .cjs extension');
  });
});
