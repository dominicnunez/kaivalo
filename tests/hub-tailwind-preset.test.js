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

const rootPath = '/home/kai/pets/kaivalo';
const presetPath = path.join(rootPath, 'packages', 'config', 'tailwind.preset.js');

test('@kaivalo/config/tailwind.preset.js is accessible via node_modules', () => {
	const nmPath = path.join(rootPath, 'node_modules', '@kaivalo', 'config', 'tailwind.preset.js');
	assert.ok(fs.existsSync(nmPath), 'tailwind.preset.js should be accessible via node_modules');
});

test('preset contains brand colors', () => {
	const content = fs.readFileSync(presetPath, 'utf8');
	assert.ok(content.includes('accent:'), 'preset should have accent color');
	assert.ok(content.includes('neutral:'), 'preset should have neutral color');
});

test('preset accent matches app.css brand color (#22c55e)', () => {
	const content = fs.readFileSync(presetPath, 'utf8');
	assert.ok(content.includes('#22c55e'), 'preset accent DEFAULT should be #22c55e (green-500)');
});

test('preset contains font family configuration', () => {
	const content = fs.readFileSync(presetPath, 'utf8');
	assert.ok(content.includes('fontFamily:'), 'preset should have fontFamily');
	assert.ok(content.includes("'Plus Jakarta Sans'"), 'preset should have Plus Jakarta Sans font');
	assert.ok(content.includes("'Clash Display'"), 'preset should have Clash Display font');
	assert.ok(content.includes("'JetBrains Mono'"), 'preset should have JetBrains Mono font');
});

test('preset contains animation utilities', () => {
	const content = fs.readFileSync(presetPath, 'utf8');
	assert.ok(content.includes('animation:'), 'preset should have animation');
	assert.ok(content.includes('keyframes:'), 'preset should have keyframes');
});

test('preset can be imported', async () => {
	const preset = await import(presetPath);
	assert.ok(preset.default, 'preset should have default export');
	assert.ok(preset.default.theme, 'preset should have theme');
	assert.ok(preset.default.theme.extend, 'preset should have theme.extend');
	assert.ok(preset.default.theme.extend.colors, 'preset should have colors');
	assert.ok(preset.default.theme.extend.fontFamily, 'preset should have fontFamily');
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
