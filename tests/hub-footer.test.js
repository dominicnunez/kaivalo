import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const pagePath = path.join(projectRoot, 'apps/hub/src/routes/+page.svelte');
const pageContent = fs.readFileSync(pagePath, 'utf-8');
// Footer structure

describe('apps/hub Footer section', () => {
  it('has <footer> element', () => {
    assert.ok(pageContent.includes('<footer'));
  });

  it('has closing </footer> tag', () => {
    assert.ok(pageContent.includes('</footer>'));
  });

  it('footer has border-t', () => {
    assert.ok(pageContent.includes('border-t'));
  });

  it('has copyright 2026', () => {
    assert.ok(pageContent.includes('2026'));
  });

  it('has kaivalo brand name', () => {
    assert.ok(pageContent.includes('kaivalo'));
  });

  it('has GitHub link', () => {
    assert.ok(pageContent.includes('github.com'));
  });

  it('GitHub link opens in new tab', () => {
    assert.ok(pageContent.includes('target="_blank"'));
  });

  it('GitHub link has security attributes', () => {
    assert.ok(pageContent.includes('rel="noopener noreferrer"'));
  });

  it('has GitHub icon', () => {
    assert.ok(pageContent.includes('Github'));
  });

  it('has contact email link', () => {
    assert.ok(pageContent.includes('mailto:kaievalo@proton.me'));
  });

  it('has Mail icon', () => {
    assert.ok(pageContent.includes('Mail'));
  });

  it('footer uses flex layout', () => {
    assert.ok(pageContent.includes('flex'));
  });

  it('responsive flex direction', () => {
    assert.ok(pageContent.includes('flex-col') && pageContent.includes('sm:flex-row'));
  });

  it('uses Container component', () => {
    assert.ok(pageContent.includes('<Container'));
  });

  it('has hover transition', () => {
    assert.ok(pageContent.includes('transition'));
  });
});
