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

// Test tailwind.config.js imports the preset
test('tailwind.config.js imports @kaivalo/config/tailwind.preset.js', () => {
	const configPath = path.join(hubPath, 'tailwind.config.js');
	const content = fs.readFileSync(configPath, 'utf8');
	assert.ok(
		content.includes("from '@kaivalo/config/tailwind.preset.js'"),
		'tailwind.config.js should import from @kaivalo/config/tailwind.preset.js'
	);
});

// Test tailwind.config.js has presets array
test('tailwind.config.js has presets array', () => {
	const configPath = path.join(hubPath, 'tailwind.config.js');
	const content = fs.readFileSync(configPath, 'utf8');
	assert.ok(content.includes('presets:'), 'tailwind.config.js should have presets key');
});

// Test tailwind.config.js uses the imported preset
test('tailwind.config.js uses kaivaloPreset in presets array', () => {
	const configPath = path.join(hubPath, 'tailwind.config.js');
	const content = fs.readFileSync(configPath, 'utf8');
	assert.ok(content.includes('kaivaloPreset'), 'tailwind.config.js should reference kaivaloPreset');
	assert.ok(content.includes('[kaivaloPreset]'), 'presets should contain kaivaloPreset');
});

// Test the preset file exists in the linked package
test('@kaivalo/config/tailwind.preset.js is accessible', () => {
	const presetPath = path.join(rootPath, 'node_modules', '@kaivalo', 'config', 'tailwind.preset.js');
	assert.ok(fs.existsSync(presetPath), 'tailwind.preset.js should be accessible via node_modules');
});

// Test the preset file has the expected content (brand colors)
test('preset contains brand colors', () => {
	const presetPath = path.join(rootPath, 'packages', 'config', 'tailwind.preset.js');
	const content = fs.readFileSync(presetPath, 'utf8');
	assert.ok(content.includes('primary:'), 'preset should have primary color');
	assert.ok(content.includes('accent:'), 'preset should have accent color');
	assert.ok(content.includes('neutral:'), 'preset should have neutral color');
});

// Test the preset file has font family
test('preset contains font family configuration', () => {
	const presetPath = path.join(rootPath, 'packages', 'config', 'tailwind.preset.js');
	const content = fs.readFileSync(presetPath, 'utf8');
	assert.ok(content.includes('fontFamily:'), 'preset should have fontFamily');
	assert.ok(content.includes("'Inter'"), 'preset should have Inter font');
});

// Test the preset file has animations
test('preset contains animation utilities', () => {
	const presetPath = path.join(rootPath, 'packages', 'config', 'tailwind.preset.js');
	const content = fs.readFileSync(presetPath, 'utf8');
	assert.ok(content.includes('animation:'), 'preset should have animation');
	assert.ok(content.includes('keyframes:'), 'preset should have keyframes');
});

// Test tailwind.config.js still has content array
test('tailwind.config.js retains content array', () => {
	const configPath = path.join(hubPath, 'tailwind.config.js');
	const content = fs.readFileSync(configPath, 'utf8');
	assert.ok(content.includes('content:'), 'tailwind.config.js should retain content array');
	assert.ok(content.includes('./src/**/*.{html,js,svelte,ts}'), 'content should include src files');
});

// Test tailwind.config.js still has theme.extend
test('tailwind.config.js retains theme.extend', () => {
	const configPath = path.join(hubPath, 'tailwind.config.js');
	const content = fs.readFileSync(configPath, 'utf8');
	assert.ok(content.includes('theme:'), 'tailwind.config.js should retain theme object');
	assert.ok(content.includes('extend:'), 'tailwind.config.js should retain extend object');
});

// Test tailwind.config.js still has plugins array
test('tailwind.config.js retains plugins array', () => {
	const configPath = path.join(hubPath, 'tailwind.config.js');
	const content = fs.readFileSync(configPath, 'utf8');
	assert.ok(content.includes('plugins:'), 'tailwind.config.js should retain plugins array');
});

// Test the config can be dynamically imported
test('tailwind.config.js can be imported', async () => {
	const configPath = path.join(hubPath, 'tailwind.config.js');
	const config = await import(configPath);
	assert.ok(config.default, 'config should have default export');
	assert.ok(Array.isArray(config.default.presets), 'config should have presets array');
	assert.ok(config.default.presets.length === 1, 'presets should have one preset');
});

// Test the imported preset has theme.extend
test('imported preset has theme.extend structure', async () => {
	const configPath = path.join(hubPath, 'tailwind.config.js');
	const config = await import(configPath);
	const preset = config.default.presets[0];
	assert.ok(preset.theme, 'preset should have theme');
	assert.ok(preset.theme.extend, 'preset should have theme.extend');
	assert.ok(preset.theme.extend.colors, 'preset should have colors');
	assert.ok(preset.theme.extend.fontFamily, 'preset should have fontFamily');
});

// Summary
console.log('\n--- Tailwind Preset Configuration Tests ---');
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
