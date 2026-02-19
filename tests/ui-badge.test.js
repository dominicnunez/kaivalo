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

  it('Badge.svelte supports live status', () => {
    assert.ok(content.includes("'live':"), 'Should define live status classes');
    assert.ok(content.includes('bg-emerald-100'), 'Live should use emerald background');
    assert.ok(content.includes('text-emerald-800'), 'Live should use emerald text');
  });

  it('Badge.svelte supports beta status', () => {
    assert.ok(content.includes("'beta':"), 'Should define beta status classes');
    assert.ok(content.includes('bg-amber-100'), 'Beta should use amber background');
    assert.ok(content.includes('text-amber-800'), 'Beta should use amber text');
  });

  it('Badge.svelte supports coming-soon status', () => {
    assert.ok(content.includes("'coming-soon':"), 'Should define coming-soon status classes');
    assert.ok(content.includes('bg-gray-100'), 'Coming soon should use gray background');
    assert.ok(content.includes('text-gray-600'), 'Coming soon should use gray text');
  });

  it('Badge.svelte supports default status', () => {
    assert.ok(content.includes("'default':"), 'Should define default status classes');
    assert.ok(content.includes('bg-blue-100'), 'Default should use blue background');
    assert.ok(content.includes('text-blue-800'), 'Default should use blue text');
  });

  it('Badge.svelte has size prop with md default', () => {
    assert.ok(content.includes('size'), 'Should have size prop');
    assert.ok(content.includes("size = 'md'"), 'Should default to md size');
  });

  it('Badge.svelte supports sm size', () => {
    assert.ok(content.includes('sm:'), 'Should define sm size classes');
    assert.ok(content.includes('text-xs'), 'sm size should use text-xs');
  });

  it('Badge.svelte supports md size', () => {
    assert.ok(content.includes('md:'), 'Should define md size classes');
    assert.ok(content.includes('text-sm'), 'md size should use text-sm');
  });

  it('Badge.svelte uses $derived for computed classes', () => {
    assert.ok(content.includes('$derived'), 'Should use $derived rune for computed classes');
  });

  it('Badge.svelte has span element for inline display', () => {
    assert.ok(content.includes('<span'), 'Should have span opening tag');
    assert.ok(content.includes('</span>'), 'Should have span closing tag');
  });

  it('Badge.svelte supports children via snippet', () => {
    assert.ok(content.includes('children'), 'Should accept children prop');
    assert.ok(content.includes('@render'), 'Should use @render for children');
  });

  it('Badge.svelte has rounded-full styling', () => {
    assert.ok(content.includes('rounded-full'), 'Should have pill-shaped border radius');
  });

  it('Badge.svelte has inline-flex display', () => {
    assert.ok(content.includes('inline-flex'), 'Should be inline-flex for proper alignment');
  });

  it('Badge.svelte supports custom class prop', () => {
    assert.ok(content.includes('class: className'), 'Should accept custom class prop');
    assert.ok(content.includes('className'), 'Should use className in computed classes');
  });
});
