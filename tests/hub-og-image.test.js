import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const ogImagePath = join(projectRoot, 'apps/hub/static/og-image.png');
// Test: File exists

describe('hub og image', () => {
  it('og-image.png exists in static directory', () => {
    assert.ok(existsSync(ogImagePath), 'og-image.png should exist');
  });

  it('og-image.png is not empty', () => {
    const stats = statSync(ogImagePath);
    assert.ok(stats.size > 0, 'og-image.png should not be empty');
  });

  it('og-image.png is reasonable size (>5KB for 1200x630)', () => {
    const stats = statSync(ogImagePath);
    assert.ok(stats.size > 5000, `og-image.png should be >5KB, got ${stats.size} bytes`);
  });

  it('og-image.png has valid PNG header', () => {
    const buffer = readFileSync(ogImagePath);
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const header = buffer.slice(0, 8);
    assert.ok(header.equals(pngSignature), 'File should have valid PNG header');
  });

  it('og-image.png contains IHDR chunk', () => {
    const buffer = readFileSync(ogImagePath);
    const content = buffer.toString('binary');
    assert.ok(content.includes('IHDR'), 'PNG should contain IHDR chunk');
  });

  it('og-image.png contains IEND chunk', () => {
    const buffer = readFileSync(ogImagePath);
    const content = buffer.toString('binary');
    assert.ok(content.includes('IEND'), 'PNG should contain IEND chunk');
  });

  it('og-image.png has correct dimensions (1200x630)', () => {
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

  it('og-image.png is in apps/hub/static directory', () => {
    const staticPath = join(projectRoot, 'apps/hub/static');
    assert.ok(existsSync(staticPath), 'apps/hub/static directory should exist');
    assert.ok(existsSync(join(staticPath, 'og-image.png')), 'og-image.png should be in static');
  });

  it('og-image.png is a substantial branded graphic (>20KB)', () => {
    const stats = statSync(ogImagePath);
    assert.ok(stats.size > 20000, `Branded OG image should be >20KB (not a placeholder), got ${stats.size} bytes`);
  });

  it('og-image.png is social media friendly (<500KB)', () => {
    const stats = statSync(ogImagePath);
    assert.ok(stats.size < 500000, `OG image should be <500KB for fast loading, got ${stats.size} bytes`);
  });

  it('og-image.png uses color (RGB/RGBA, not grayscale)', () => {
    const buffer = readFileSync(ogImagePath);
    // Color type is at IHDR offset + 8 (width) + 4 (height) + 1 (bit depth) = byte 25
    const colorTypeOffset = 8 + 8 + 4 + 4 + 1;
    const colorType = buffer.readUInt8(colorTypeOffset);
    // 2 = RGB, 6 = RGBA - both are color
    assert.ok(colorType === 2 || colorType === 6, `Color type should be RGB(2) or RGBA(6), got ${colorType}`);
  });

  it('+page.ts references og-image.png in meta', () => {
    const pageTs = join(projectRoot, 'apps/hub/src/routes/+page.ts');
    const content = readFileSync(pageTs, 'utf-8');
    assert.ok(content.includes('og-image.png'), '+page.ts should reference og-image.png');
  });
});
