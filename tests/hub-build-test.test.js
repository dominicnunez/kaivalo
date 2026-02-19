import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const HUB_DIR = join(ROOT, 'apps/hub');
const BUILD_DIR = join(HUB_DIR, 'build');
// Test build exists

describe('hub build test', () => {
  it('build directory exists', () => {
    assert.ok(existsSync(BUILD_DIR), 'Build directory should exist');
  });

  it('build directory is not empty', () => {
    const files = readdirSync(BUILD_DIR);
    assert.ok(files.length > 0, 'Build directory should have files');
  });

  it('build has index.js entry point', () => {
    const indexPath = join(BUILD_DIR, 'index.js');
    assert.ok(existsSync(indexPath), 'build/index.js should exist');
  });

  it('build index.js is valid JavaScript', () => {
    const indexPath = join(BUILD_DIR, 'index.js');
    const content = readFileSync(indexPath, 'utf8');
    assert.ok(content.length > 0, 'index.js should have content');
    assert.ok(content.includes('export') || content.includes('import'), 'index.js should be ES module');
  });

  it('build has handler.js', () => {
    const handlerPath = join(BUILD_DIR, 'handler.js');
    assert.ok(existsSync(handlerPath), 'build/handler.js should exist');
  });

  it('build has client directory', () => {
    const clientDir = join(BUILD_DIR, 'client');
    assert.ok(existsSync(clientDir), 'build/client should exist');
    assert.ok(statSync(clientDir).isDirectory(), 'build/client should be a directory');
  });

  it('build has server directory', () => {
    const serverDir = join(BUILD_DIR, 'server');
    assert.ok(existsSync(serverDir), 'build/server should exist');
    assert.ok(statSync(serverDir).isDirectory(), 'build/server should be a directory');
  });

  it('client directory has _app subdirectory', () => {
    const appDir = join(BUILD_DIR, 'client/_app');
    assert.ok(existsSync(appDir), 'build/client/_app should exist');
  });

  it('client has immutable assets', () => {
    const immutableDir = join(BUILD_DIR, 'client/_app/immutable');
    assert.ok(existsSync(immutableDir), 'build/client/_app/immutable should exist');
  });

  it('client has version.json', () => {
    const versionPath = join(BUILD_DIR, 'client/_app/version.json');
    assert.ok(existsSync(versionPath), 'build/client/_app/version.json should exist');
  });

  it('static assets are copied (favicon.ico)', () => {
    const faviconPath = join(BUILD_DIR, 'client/favicon.ico');
    assert.ok(existsSync(faviconPath), 'favicon.ico should be in build/client');
  });

  it('static assets are copied (og-image.png)', () => {
    const ogImagePath = join(BUILD_DIR, 'client/og-image.png');
    assert.ok(existsSync(ogImagePath), 'og-image.png should be in build/client');
  });

  it('npm run build succeeds', () => {
    execSync('npm run build 2>&1', {
    cwd: HUB_DIR,
    timeout: 180000,
    encoding: 'utf8'
    });
  });

  it('page includes responsive grid classes', () => {
    const pagePath = join(HUB_DIR, 'src/routes/+page.svelte');
    const content = readFileSync(pagePath, 'utf8');
    assert.ok(content.includes('grid-cols-1'), 'Should have mobile grid class');
    assert.ok(content.includes('sm:grid-cols-2'), 'Should have tablet grid class');
  });

  it('page includes responsive text sizes', () => {
    const pagePath = join(HUB_DIR, 'src/routes/+page.svelte');
    const content = readFileSync(pagePath, 'utf8');
    assert.ok(content.includes('text-4xl'), 'Should have base heading size');
    assert.ok(content.includes('sm:text-5xl'), 'Should have sm breakpoint');
    assert.ok(content.includes('md:text-7xl'), 'Should have md breakpoint');
  });

  it('page includes responsive layout classes', () => {
    const pagePath = join(HUB_DIR, 'src/routes/+page.svelte');
    const content = readFileSync(pagePath, 'utf8');
    assert.ok(content.includes('flex-col'), 'Should have flex-col for mobile');
    assert.ok(content.includes('sm:flex-row'), 'Should have sm:flex-row for larger screens');
  });
});
