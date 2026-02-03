import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const testResults = [];
function test(name, fn) {
	try {
		fn();
		testResults.push({ name, passed: true });
	} catch (error) {
		testResults.push({ name, passed: false, error: error.message });
	}
}

const hubPath = '/home/kai/pets/kaivalo/apps/hub';
const rootPath = '/home/kai/pets/kaivalo';

// Test tailwindcss is installed
test('tailwindcss package is installed', () => {
	const tailwindPath = path.join(rootPath, 'node_modules', 'tailwindcss');
	assert.ok(fs.existsSync(tailwindPath), 'tailwindcss package should exist in node_modules');
});

// Test postcss is installed
test('postcss package is installed', () => {
	const postcssPath = path.join(rootPath, 'node_modules', 'postcss');
	assert.ok(fs.existsSync(postcssPath), 'postcss package should exist in node_modules');
});

// Test autoprefixer is installed
test('autoprefixer package is installed', () => {
	const autoprefixerPath = path.join(rootPath, 'node_modules', 'autoprefixer');
	assert.ok(fs.existsSync(autoprefixerPath), 'autoprefixer package should exist in node_modules');
});

// Test @tailwindcss/vite is installed (for Tailwind v4)
test('@tailwindcss/vite package is installed', () => {
	const vitePath = path.join(rootPath, 'node_modules', '@tailwindcss', 'vite');
	assert.ok(fs.existsSync(vitePath), '@tailwindcss/vite package should exist for Tailwind v4');
});

// Test tailwind.config.js exists
test('tailwind.config.js exists', () => {
	const configPath = path.join(hubPath, 'tailwind.config.js');
	assert.ok(fs.existsSync(configPath), 'tailwind.config.js should exist');
});

// Test tailwind.config.js has content array
test('tailwind.config.js has content array', () => {
	const configPath = path.join(hubPath, 'tailwind.config.js');
	const content = fs.readFileSync(configPath, 'utf8');
	assert.ok(content.includes('content:'), 'tailwind.config.js should have content array');
	assert.ok(content.includes('./src/**/*.{html,js,svelte,ts}'), 'content should include src files');
});

// Test tailwind.config.js has theme.extend
test('tailwind.config.js has theme.extend', () => {
	const configPath = path.join(hubPath, 'tailwind.config.js');
	const content = fs.readFileSync(configPath, 'utf8');
	assert.ok(content.includes('theme:'), 'tailwind.config.js should have theme object');
	assert.ok(content.includes('extend:'), 'tailwind.config.js should have extend object');
});

// Test tailwind.config.js has plugins array
test('tailwind.config.js has plugins array', () => {
	const configPath = path.join(hubPath, 'tailwind.config.js');
	const content = fs.readFileSync(configPath, 'utf8');
	assert.ok(content.includes('plugins:'), 'tailwind.config.js should have plugins array');
});

// Test tailwind.config.js exports default
test('tailwind.config.js uses ES module export', () => {
	const configPath = path.join(hubPath, 'tailwind.config.js');
	const content = fs.readFileSync(configPath, 'utf8');
	assert.ok(content.includes('export default'), 'tailwind.config.js should use ES module export');
});

// Test postcss.config.js exists
test('postcss.config.js exists', () => {
	const configPath = path.join(hubPath, 'postcss.config.js');
	assert.ok(fs.existsSync(configPath), 'postcss.config.js should exist');
});

// Test postcss.config.js uses ES module export
test('postcss.config.js uses ES module export', () => {
	const configPath = path.join(hubPath, 'postcss.config.js');
	const content = fs.readFileSync(configPath, 'utf8');
	assert.ok(content.includes('export default'), 'postcss.config.js should use ES module export');
});

// Test postcss.config.js has plugins object
test('postcss.config.js has plugins object', () => {
	const configPath = path.join(hubPath, 'postcss.config.js');
	const content = fs.readFileSync(configPath, 'utf8');
	assert.ok(content.includes('plugins'), 'postcss.config.js should have plugins');
});

// Test app.css exists with Tailwind imports
test('app.css exists', () => {
	const cssPath = path.join(hubPath, 'src', 'app.css');
	assert.ok(fs.existsSync(cssPath), 'app.css should exist');
});

// Test app.css imports tailwindcss (v4 style)
test('app.css imports tailwindcss', () => {
	const cssPath = path.join(hubPath, 'src', 'app.css');
	const content = fs.readFileSync(cssPath, 'utf8');
	assert.ok(content.includes('@import "tailwindcss"'), 'app.css should import tailwindcss (v4 style)');
});

// Test vite.config.ts imports tailwindcss
test('vite.config.ts imports @tailwindcss/vite', () => {
	const vitePath = path.join(hubPath, 'vite.config.ts');
	const content = fs.readFileSync(vitePath, 'utf8');
	assert.ok(content.includes("from '@tailwindcss/vite'"), 'vite.config.ts should import @tailwindcss/vite');
});

// Test vite.config.ts uses tailwindcss plugin
test('vite.config.ts uses tailwindcss plugin', () => {
	const vitePath = path.join(hubPath, 'vite.config.ts');
	const content = fs.readFileSync(vitePath, 'utf8');
	assert.ok(content.includes('tailwindcss()'), 'vite.config.ts should use tailwindcss() plugin');
});

// Test tailwindcss is v4
test('tailwindcss is version 4.x', () => {
	const pkgPath = path.join(rootPath, 'node_modules', 'tailwindcss', 'package.json');
	const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
	assert.ok(pkg.version.startsWith('4.'), `tailwindcss should be v4.x, got ${pkg.version}`);
});

// Summary
console.log('\n--- Tailwind Installation Tests ---');
let passed = 0;
let failed = 0;
for (const result of testResults) {
	if (result.passed) {
		console.log(`✓ ${result.name}`);
		passed++;
	} else {
		console.log(`✗ ${result.name}: ${result.error}`);
		failed++;
	}
}
console.log(`\nTotal: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
