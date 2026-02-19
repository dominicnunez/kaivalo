import assert from 'node:assert';
import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const HUB_DIR = join(ROOT, 'apps/hub');
const BUILD_DIR = join(HUB_DIR, 'build');

let passed = 0;
let failed = 0;

function test(name, fn) {
	try {
		fn();
		console.log(`  ✓ ${name}`);
		passed++;
	} catch (error) {
		console.log(`  ✗ ${name}`);
		console.log(`    ${error.message}`);
		failed++;
	}
}

console.log('Testing: apps/hub build and production readiness');

// Test build exists
test('build directory exists', () => {
	assert.ok(existsSync(BUILD_DIR), 'Build directory should exist');
});

test('build directory is not empty', () => {
	const files = readdirSync(BUILD_DIR);
	assert.ok(files.length > 0, 'Build directory should have files');
});

test('build has index.js entry point', () => {
	const indexPath = join(BUILD_DIR, 'index.js');
	assert.ok(existsSync(indexPath), 'build/index.js should exist');
});

test('build index.js is valid JavaScript', () => {
	const indexPath = join(BUILD_DIR, 'index.js');
	const content = readFileSync(indexPath, 'utf8');
	assert.ok(content.length > 0, 'index.js should have content');
	assert.ok(content.includes('export') || content.includes('import'), 'index.js should be ES module');
});

test('build has handler.js', () => {
	const handlerPath = join(BUILD_DIR, 'handler.js');
	assert.ok(existsSync(handlerPath), 'build/handler.js should exist');
});

test('build has client directory', () => {
	const clientDir = join(BUILD_DIR, 'client');
	assert.ok(existsSync(clientDir), 'build/client should exist');
	assert.ok(statSync(clientDir).isDirectory(), 'build/client should be a directory');
});

test('build has server directory', () => {
	const serverDir = join(BUILD_DIR, 'server');
	assert.ok(existsSync(serverDir), 'build/server should exist');
	assert.ok(statSync(serverDir).isDirectory(), 'build/server should be a directory');
});

test('client directory has _app subdirectory', () => {
	const appDir = join(BUILD_DIR, 'client/_app');
	assert.ok(existsSync(appDir), 'build/client/_app should exist');
});

test('client has immutable assets', () => {
	const immutableDir = join(BUILD_DIR, 'client/_app/immutable');
	assert.ok(existsSync(immutableDir), 'build/client/_app/immutable should exist');
});

test('client has version.json', () => {
	const versionPath = join(BUILD_DIR, 'client/_app/version.json');
	assert.ok(existsSync(versionPath), 'build/client/_app/version.json should exist');
});

test('static assets are copied (favicon.ico)', () => {
	const faviconPath = join(BUILD_DIR, 'client/favicon.ico');
	assert.ok(existsSync(faviconPath), 'favicon.ico should be in build/client');
});

test('static assets are copied (og-image.png)', () => {
	const ogImagePath = join(BUILD_DIR, 'client/og-image.png');
	assert.ok(existsSync(ogImagePath), 'og-image.png should be in build/client');
});

// Test npm run build works
test('npm run build succeeds', () => {
	const result = execSync('npm run build 2>&1', {
		cwd: HUB_DIR,
		timeout: 180000,
		encoding: 'utf8'
	});
	assert.ok(result.includes('done'), 'Build should complete with "done" message');
});

test('build does not produce errors', () => {
	const result = execSync('npm run build 2>&1', {
		cwd: HUB_DIR,
		timeout: 180000,
		encoding: 'utf8'
	});
	assert.ok(!result.includes('error during build'), 'Build should not have errors');
});

test('build uses adapter-node', () => {
	const result = execSync('npm run build 2>&1', {
		cwd: HUB_DIR,
		timeout: 180000,
		encoding: 'utf8'
	});
	assert.ok(result.includes('@sveltejs/adapter-node'), 'Build should use adapter-node');
});

// Test responsive design elements exist in build
test('page includes responsive grid classes', () => {
	const pagePath = join(HUB_DIR, 'src/routes/+page.svelte');
	const content = readFileSync(pagePath, 'utf8');
	assert.ok(content.includes('grid-cols-1'), 'Should have mobile grid class');
	assert.ok(content.includes('sm:grid-cols-2'), 'Should have tablet grid class');
});

test('page includes responsive text sizes', () => {
	const pagePath = join(HUB_DIR, 'src/routes/+page.svelte');
	const content = readFileSync(pagePath, 'utf8');
	assert.ok(content.includes('text-4xl'), 'Should have base heading size');
	assert.ok(content.includes('sm:text-5xl'), 'Should have sm breakpoint');
	assert.ok(content.includes('md:text-7xl'), 'Should have md breakpoint');
});

test('page includes responsive layout classes', () => {
	const pagePath = join(HUB_DIR, 'src/routes/+page.svelte');
	const content = readFileSync(pagePath, 'utf8');
	assert.ok(content.includes('flex-col'), 'Should have flex-col for mobile');
	assert.ok(content.includes('sm:flex-row'), 'Should have sm:flex-row for larger screens');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
