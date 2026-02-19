import { describe, it } from 'node:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import assert from 'node:assert';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const staticDir = join(projectRoot, 'apps', 'hub', 'static');
const faviconIco = join(staticDir, 'favicon.ico');
const faviconSvg = join(staticDir, 'favicon.svg');
const favicon192 = join(staticDir, 'favicon-192.png');
const favicon512 = join(staticDir, 'favicon-512.png');
// ── ICO tests ──

describe('hub favicon', () => {
  it('favicon.ico exists', () => {
    assert.ok(existsSync(faviconIco), 'favicon.ico should exist in static directory');
  });

  it('favicon.ico is not empty', () => {
    const stats = statSync(faviconIco);
    assert.ok(stats.size > 0, 'favicon.ico should not be empty');
  });

  it('favicon.ico has valid size for icon file', () => {
    const stats = statSync(faviconIco);
    assert.ok(stats.size >= 100, 'favicon.ico should be at least 100 bytes');
    assert.ok(stats.size < 102_400, 'favicon.ico should be less than 100KB');
  });

  it('favicon.ico has valid ICO header', () => {
    const buffer = readFileSync(faviconIco);
    assert.strictEqual(buffer[0], 0x00, 'First byte should be 0x00');
    assert.strictEqual(buffer[1], 0x00, 'Second byte should be 0x00');
    assert.strictEqual(buffer[2], 0x01, 'Third byte should be 0x01 (ICO type)');
    assert.strictEqual(buffer[3], 0x00, 'Fourth byte should be 0x00');
  });

  it('favicon.ico contains multiple sizes', () => {
    const buffer = readFileSync(faviconIco);
    const numImages = buffer[4] + (buffer[5] << 8);
    assert.ok(numImages >= 2, `Should contain at least 2 sizes, got ${numImages}`);
  });

  it('favicon.ico contains PNG image data', () => {
    const buffer = readFileSync(faviconIco);
    const content = buffer.toString('binary');
    assert.ok(content.includes('\x89PNG'), 'Should contain PNG image data');
  });

  it('favicon.svg exists', () => {
    assert.ok(existsSync(faviconSvg), 'favicon.svg should exist in static directory');
  });

  it('favicon.svg is valid SVG', () => {
    const content = readFileSync(faviconSvg, 'utf8');
    assert.ok(content.includes('<svg'), 'Should contain <svg tag');
    assert.ok(content.includes('xmlns="http://www.w3.org/2000/svg"'), 'Should have SVG namespace');
  });

  it('favicon.svg contains K letter', () => {
    const content = readFileSync(faviconSvg, 'utf8');
    assert.ok(content.includes('>K<'), 'Should contain the letter K');
  });

  it('favicon.svg uses brand accent color', () => {
    const content = readFileSync(faviconSvg, 'utf8');
    assert.ok(content.includes('#22c55e'), 'Should use accent green (#22c55e)');
  });

  it('favicon.svg uses dark background', () => {
    const content = readFileSync(faviconSvg, 'utf8');
    assert.ok(content.includes('#06060a'), 'Should use dark background (#06060a)');
  });

  it('favicon-192.png exists', () => {
    assert.ok(existsSync(favicon192), 'favicon-192.png should exist');
  });

  it('favicon-192.png has valid PNG header', () => {
    const buffer = readFileSync(favicon192);
    assert.strictEqual(buffer[0], 0x89, 'PNG signature byte 0');
    assert.strictEqual(buffer[1], 0x50, 'PNG signature byte 1 (P)');
    assert.strictEqual(buffer[2], 0x4E, 'PNG signature byte 2 (N)');
    assert.strictEqual(buffer[3], 0x47, 'PNG signature byte 3 (G)');
  });

  it('favicon-512.png exists', () => {
    assert.ok(existsSync(favicon512), 'favicon-512.png should exist');
  });

  it('favicon-512.png has valid PNG header', () => {
    const buffer = readFileSync(favicon512);
    assert.strictEqual(buffer[0], 0x89, 'PNG signature byte 0');
    assert.strictEqual(buffer[1], 0x50, 'PNG signature byte 1 (P)');
    assert.strictEqual(buffer[2], 0x4E, 'PNG signature byte 2 (N)');
    assert.strictEqual(buffer[3], 0x47, 'PNG signature byte 3 (G)');
  });

  it('app.html references SVG favicon', () => {
    const appHtml = readFileSync(join(projectRoot, 'apps', 'hub', 'src', 'app.html'), 'utf8');
    assert.ok(appHtml.includes('favicon.svg'), 'app.html should reference favicon.svg');
    assert.ok(appHtml.includes('image/svg+xml'), 'SVG link should have correct MIME type');
  });

  it('app.html references ICO favicon as fallback', () => {
    const appHtml = readFileSync(join(projectRoot, 'apps', 'hub', 'src', 'app.html'), 'utf8');
    assert.ok(appHtml.includes('favicon.ico'), 'app.html should reference favicon.ico');
  });
});
