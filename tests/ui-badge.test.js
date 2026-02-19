import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const badgePath = join(rootDir, 'packages', 'ui', 'Badge.svelte');
let content;

describe('ui badge', () => {
  it('Badge.svelte exists', () => {
    assert.ok(existsSync(badgePath), 'Badge.svelte should exist');
  });

  it('Badge.svelte is readable', () => {
    content = readFileSync(badgePath, 'utf-8');
    assert.ok(content, 'Should be able to read Badge.svelte');
  });

  it('Badge.svelte has script section', () => {
    assert.ok(content.includes('<script>'), 'Should have script opening tag');
    assert.ok(content.includes('</script>'), 'Should have script closing tag');
  });

  it('Badge.svelte uses Svelte 5 $props rune', () => {
    assert.ok(content.includes('$props()'), 'Should use $props() rune for props');
  });

  it('Badge.svelte has status prop with default value', () => {
    assert.ok(content.includes('status'), 'Should have status prop');
    assert.ok(content.includes("status = 'default'"), 'Should default to default status');
  });

  it('Badge.svelte has scoped live status styles', () => {
    assert.ok(content.includes('.badge-live'), 'Should define .badge-live class');
    assert.ok(content.includes('var(--accent)'), 'Live should use --accent color');
  });

  it('Badge.svelte has scoped beta status styles', () => {
    assert.ok(content.includes('.badge-beta'), 'Should define .badge-beta class');
  });

  it('Badge.svelte has scoped coming-soon status styles', () => {
    assert.ok(content.includes('.badge-coming-soon'), 'Should define .badge-coming-soon class');
    assert.ok(content.includes('var(--text-muted)'), 'Coming soon should use --text-muted');
  });

  it('Badge.svelte has scoped default status styles', () => {
    assert.ok(content.includes('.badge-default'), 'Should define .badge-default class');
    assert.ok(content.includes('var(--text-secondary)'), 'Default should use --text-secondary');
  });

  it('Badge.svelte has size prop with md default', () => {
    assert.ok(content.includes('size'), 'Should have size prop');
    assert.ok(content.includes("size = 'md'"), 'Should default to md size');
  });

  it('Badge.svelte has scoped size classes', () => {
    assert.ok(content.includes('.badge-sm'), 'Should define .badge-sm class');
    assert.ok(content.includes('.badge-md'), 'Should define .badge-md class');
  });

  it('Badge.svelte has span element for inline display', () => {
    assert.ok(content.includes('<span'), 'Should have span opening tag');
    assert.ok(content.includes('</span>'), 'Should have span closing tag');
  });

  it('Badge.svelte supports children via snippet', () => {
    assert.ok(content.includes('children'), 'Should accept children prop');
    assert.ok(content.includes('@render'), 'Should use @render for children');
  });

  it('Badge.svelte has pill-shaped border radius', () => {
    assert.ok(content.includes('border-radius: 9999px'), 'Should have pill-shaped border radius');
  });

  it('Badge.svelte has inline-flex display', () => {
    assert.ok(content.includes('inline-flex'), 'Should be inline-flex for proper alignment');
  });

  it('Badge.svelte supports custom class prop', () => {
    assert.ok(content.includes('class: className'), 'Should accept custom class prop');
    assert.ok(content.includes('className'), 'Should use className in template');
  });

  it('Badge.svelte uses scoped style block', () => {
    assert.ok(content.includes('<style>'), 'Should have scoped style block');
    assert.ok(content.includes('</style>'), 'Should close style block');
  });
});
