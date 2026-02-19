import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const hubDir = resolve(import.meta.dirname, '..', 'apps', 'hub');
const appCssPath = resolve(hubDir, 'src', 'app.css');
const appHtmlPath = resolve(hubDir, 'src', 'app.html');

const content = existsSync(appCssPath) ? readFileSync(appCssPath, 'utf8') : '';
const htmlContent = existsSync(appHtmlPath) ? readFileSync(appHtmlPath, 'utf8') : '';
const combined = content + htmlContent;

describe('apps/hub/src/app.css', () => {
  it('file exists', () => {
    assert.ok(existsSync(appCssPath));
  });

  it('contains Tailwind import', () => {
    assert.ok(content.includes('@import "tailwindcss"'));
  });

  it('loads fonts from CDN (via CSS or app.html)', () => {
    assert.ok(combined.includes('fonts.googleapis.com') || combined.includes('fontshare.com'));
  });

  it('configures font weights 400, 500, 600', () => {
    assert.ok(combined.includes('400'));
    assert.ok(combined.includes('500'));
    assert.ok(combined.includes('600'));
  });

  it('has @layer base block', () => {
    assert.ok(content.includes('@layer base'));
  });

  it('sets body font-family', () => {
    assert.ok(content.includes('font-family:'));
  });

  it('includes system font fallbacks', () => {
    assert.ok(content.includes('sans-serif'));
  });

  it('has smooth scroll behavior', () => {
    assert.ok(content.includes('scroll-behavior: smooth'));
  });

  it('has font smoothing', () => {
    assert.ok(content.includes('-webkit-font-smoothing') || content.includes('font-smooth'));
  });

  it('has selection styling', () => {
    assert.ok(content.includes('::selection'));
  });

  it('has @layer components block', () => {
    assert.ok(content.includes('@layer components'));
  });

  it('uses display=swap for font loading performance', () => {
    assert.ok(combined.includes('display=swap'));
  });

  it('has header comment', () => {
    assert.ok(content.includes('Kaivalo Hub'));
  });

  it('has CSS custom properties', () => {
    assert.ok(content.includes(':root'));
    assert.ok(content.includes('--bg-primary'));
    assert.ok(content.includes('--accent'));
  });

  it('has animation utilities', () => {
    assert.ok(content.includes('@keyframes') || content.includes('animation'));
  });
});
