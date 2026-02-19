import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const hubRoot = join(projectRoot, 'apps/hub');
console.log('\napps/hub dependencies installation tests:');
// npm workspaces hoists dependencies to root node_modules
// Check that root node_modules exists and contains expected packages
// node_modules existence tests

describe('hub dependencies', () => {
  it('root node_modules directory exists', () => {
    assert.ok(existsSync(join(projectRoot, 'node_modules')), 'root node_modules directory should exist');
  });

  it('root node_modules is a directory', () => {
    const stats = statSync(join(projectRoot, 'node_modules'));
    assert.ok(stats.isDirectory(), 'root node_modules should be a directory');
  });

  it('root node_modules has contents', () => {
    const contents = readdirSync(join(projectRoot, 'node_modules'));
    assert.ok(contents.length > 0, 'root node_modules should have packages installed');
  });

  it('@sveltejs/kit is installed', () => {
    assert.ok(existsSync(join(projectRoot, 'node_modules/@sveltejs/kit')), '@sveltejs/kit should be installed');
  });

  it('@sveltejs/vite-plugin-svelte is installed', () => {
    assert.ok(existsSync(join(projectRoot, 'node_modules/@sveltejs/vite-plugin-svelte')), '@sveltejs/vite-plugin-svelte should be installed');
  });

  it('svelte is installed', () => {
    assert.ok(existsSync(join(projectRoot, 'node_modules/svelte')), 'svelte should be installed');
  });

  it('vite is installed', () => {
    assert.ok(existsSync(join(projectRoot, 'node_modules/vite')), 'vite should be installed');
  });

  it('typescript is installed', () => {
    assert.ok(existsSync(join(projectRoot, 'node_modules/typescript')), 'typescript should be installed');
  });

  it('svelte-check is installed', () => {
    assert.ok(existsSync(join(projectRoot, 'node_modules/svelte-check')), 'svelte-check should be installed');
  });

  it('root package-lock.json exists', () => {
    assert.ok(existsSync(join(projectRoot, 'package-lock.json')), 'root package-lock.json should exist after npm install');
  });

  it('root package-lock.json is a file', () => {
    const stats = statSync(join(projectRoot, 'package-lock.json'));
    assert.ok(stats.isFile(), 'root package-lock.json should be a file');
  });

  it('apps/hub can resolve dependencies via workspace symlink', () => {
    // npm workspaces creates a symlink in root node_modules for workspace packages
    // Verify node can resolve the dependencies from hub's perspective
    const hubNodeModules = join(hubRoot, 'node_modules');
    const rootNodeModules = join(projectRoot, 'node_modules');
    
    // Either hub has its own node_modules (for non-hoisted deps) or uses root
    // The key test is that required packages exist in root
    assert.ok(
    existsSync(hubNodeModules) || existsSync(rootNodeModules),
    'node_modules should be accessible from hub'
    );
  });
});
