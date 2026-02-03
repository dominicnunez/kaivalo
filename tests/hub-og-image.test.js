import assert from 'node:assert';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Test helper
const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
  }
}

const ogImagePath = join(process.cwd(), 'apps/hub/static/og-image.png');

// Test: File exists
test('og-image.png exists in static directory', () => {
  assert.ok(existsSync(ogImagePath), 'og-image.png should exist');
});

// Test: File is not empty
test('og-image.png is not empty', () => {
  const stats = statSync(ogImagePath);
  assert.ok(stats.size > 0, 'og-image.png should not be empty');
});

// Test: File is reasonable size for 1200x630 image
test('og-image.png is reasonable size (>5KB for 1200x630)', () => {
  const stats = statSync(ogImagePath);
  assert.ok(stats.size > 5000, `og-image.png should be >5KB, got ${stats.size} bytes`);
});

// Test: File has PNG header
test('og-image.png has valid PNG header', () => {
  const buffer = readFileSync(ogImagePath);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const header = buffer.slice(0, 8);
  assert.ok(header.equals(pngSignature), 'File should have valid PNG header');
});

// Test: File contains IHDR chunk (image header)
test('og-image.png contains IHDR chunk', () => {
  const buffer = readFileSync(ogImagePath);
  const content = buffer.toString('binary');
  assert.ok(content.includes('IHDR'), 'PNG should contain IHDR chunk');
});

// Test: File contains IEND chunk (image end)
test('og-image.png contains IEND chunk', () => {
  const buffer = readFileSync(ogImagePath);
  const content = buffer.toString('binary');
  assert.ok(content.includes('IEND'), 'PNG should contain IEND chunk');
});

// Test: PNG has correct dimensions (1200x630) by reading IHDR
test('og-image.png has correct dimensions (1200x630)', () => {
  const buffer = readFileSync(ogImagePath);
  // IHDR chunk starts at byte 8 (after PNG signature)
  // IHDR format: 4 bytes length, 4 bytes 'IHDR', 4 bytes width, 4 bytes height
  const ihdrOffset = 8;
  const widthOffset = ihdrOffset + 8;  // After length + 'IHDR'
  const heightOffset = widthOffset + 4;

  const width = buffer.readUInt32BE(widthOffset);
  const height = buffer.readUInt32BE(heightOffset);

  assert.strictEqual(width, 1200, `Width should be 1200, got ${width}`);
  assert.strictEqual(height, 630, `Height should be 630, got ${height}`);
});

// Test: File is in correct location relative to static
test('og-image.png is in apps/hub/static directory', () => {
  const staticPath = join(process.cwd(), 'apps/hub/static');
  assert.ok(existsSync(staticPath), 'apps/hub/static directory should exist');
  assert.ok(existsSync(join(staticPath, 'og-image.png')), 'og-image.png should be in static');
});

// Print results
console.log('\n=== OG Image Tests ===\n');
let passed = 0;
let failed = 0;

for (const result of results) {
  if (result.passed) {
    console.log(`✓ ${result.name}`);
    passed++;
  } else {
    console.log(`✗ ${result.name}`);
    console.log(`  Error: ${result.error}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
