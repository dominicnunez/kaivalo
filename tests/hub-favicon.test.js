import { existsSync, readFileSync, statSync } from 'fs';
import { strict as assert } from 'assert';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

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

console.log('\n🧪 Testing favicon.ico...\n');

const faviconPath = join(projectRoot, 'apps', 'hub', 'static', 'favicon.ico');

// Test 1: File exists
test('favicon.ico exists', () => {
	assert.ok(existsSync(faviconPath), 'favicon.ico should exist in static directory');
});

// Test 2: File is not empty
test('favicon.ico is not empty', () => {
	const stats = statSync(faviconPath);
	assert.ok(stats.size > 0, 'favicon.ico should not be empty');
});

// Test 3: File has reasonable size for an icon
test('favicon.ico has valid size for icon file', () => {
	const stats = statSync(faviconPath);
	assert.ok(stats.size >= 100, 'favicon.ico should be at least 100 bytes');
	assert.ok(stats.size < 50000, 'favicon.ico should be less than 50KB');
});

// Test 4: Has valid ICO header (first 4 bytes: 00 00 01 00)
test('favicon.ico has valid ICO header', () => {
	const buffer = readFileSync(faviconPath);
	// ICO files start with: 00 00 (reserved) + 01 00 (type = 1 for ICO)
	assert.strictEqual(buffer[0], 0x00, 'First byte should be 0x00');
	assert.strictEqual(buffer[1], 0x00, 'Second byte should be 0x00');
	assert.strictEqual(buffer[2], 0x01, 'Third byte should be 0x01 (ICO type)');
	assert.strictEqual(buffer[3], 0x00, 'Fourth byte should be 0x00');
});

// Test 5: Has at least one image
test('favicon.ico contains at least one image', () => {
	const buffer = readFileSync(faviconPath);
	// Bytes 4-5 are the number of images (little endian)
	const numImages = buffer[4] + (buffer[5] << 8);
	assert.ok(numImages >= 1, 'Should contain at least one image');
});

// Test 6: File is in correct location
test('favicon.ico is in apps/hub/static directory', () => {
	const expectedDir = join(projectRoot, 'apps', 'hub', 'static');
	assert.ok(faviconPath.startsWith(expectedDir), 'Should be in apps/hub/static directory');
});

// Test 7: File is readable
test('favicon.ico is readable', () => {
	let readable = false;
	try {
		readFileSync(faviconPath);
		readable = true;
	} catch (e) {
		readable = false;
	}
	assert.ok(readable, 'favicon.ico should be readable');
});

// Test 8: Contains PNG data (modern ICO files often use embedded PNG)
test('favicon.ico contains PNG image data', () => {
	const buffer = readFileSync(faviconPath);
	const content = buffer.toString('binary');
	// PNG magic bytes: 89 50 4E 47 (which is \x89PNG in ASCII)
	assert.ok(content.includes('\x89PNG'), 'Should contain PNG image data');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
	process.exit(1);
}
