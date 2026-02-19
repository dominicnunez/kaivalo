import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const buttonPath = join(rootDir, 'packages', 'ui', 'Button.svelte');
let content;

describe('ui button', () => {
  it('Button.svelte exists', () => {
    assert.ok(existsSync(buttonPath), 'Button.svelte should exist');
  });

  it('Button.svelte is readable', () => {
    content = readFileSync(buttonPath, 'utf-8');
    assert.ok(content, 'Should be able to read Button.svelte');
  });

  it('Button.svelte has script section', () => {
    assert.ok(content.includes('<script>'), 'Should have script opening tag');
    assert.ok(content.includes('</script>'), 'Should have script closing tag');
  });

  it('Button.svelte uses Svelte 5 $props rune', () => {
    assert.ok(content.includes('$props()'), 'Should use $props() rune for props');
  });

  it('Button.svelte has variant prop with primary default', () => {
    assert.ok(content.includes('variant'), 'Should have variant prop');
    assert.ok(content.includes("variant = 'primary'"), 'Should default to primary variant');
  });

  it('Button.svelte supports primary variant', () => {
    assert.ok(content.includes('primary:'), 'Should define primary variant classes');
    assert.ok(content.includes('bg-blue-600'), 'Primary should use blue background');
  });

  it('Button.svelte supports secondary variant', () => {
    assert.ok(content.includes('secondary:'), 'Should define secondary variant classes');
    assert.ok(content.includes('bg-gray-200'), 'Secondary should use gray background');
  });

  it('Button.svelte supports ghost variant', () => {
    assert.ok(content.includes('ghost:'), 'Should define ghost variant classes');
    assert.ok(content.includes('bg-transparent'), 'Ghost should be transparent');
  });

  it('Button.svelte has size prop with md default', () => {
    assert.ok(content.includes('size'), 'Should have size prop');
    assert.ok(content.includes("size = 'md'"), 'Should default to md size');
  });

  it('Button.svelte supports sm size', () => {
    assert.ok(content.includes('sm:'), 'Should define sm size classes');
    assert.ok(content.includes('text-sm'), 'sm size should use text-sm');
  });

  it('Button.svelte supports md size', () => {
    assert.ok(content.includes('md:'), 'Should define md size classes');
    assert.ok(content.includes('text-base'), 'md size should use text-base');
  });

  it('Button.svelte supports lg size', () => {
    assert.ok(content.includes('lg:'), 'Should define lg size classes');
    assert.ok(content.includes('text-lg'), 'lg size should use text-lg');
  });

  it('Button.svelte has disabled prop', () => {
    assert.ok(content.includes('disabled'), 'Should have disabled prop');
    assert.ok(content.includes('disabled = false'), 'Should default disabled to false');
  });

  it('Button.svelte uses disabled attribute on button', () => {
    assert.ok(content.includes('{disabled}'), 'Should bind disabled attribute');
  });

  it('Button.svelte has disabled styling', () => {
    assert.ok(content.includes('disabled:'), 'Should have disabled state classes');
    assert.ok(content.includes('cursor-not-allowed'), 'Should show not-allowed cursor when disabled');
  });

  it('Button.svelte uses $derived for computed classes', () => {
    assert.ok(content.includes('$derived'), 'Should use $derived rune for computed classes');
  });

  it('Button.svelte has button element', () => {
    assert.ok(content.includes('<button'), 'Should have button opening tag');
    assert.ok(content.includes('</button>'), 'Should have button closing tag');
  });

  it('Button.svelte supports children via snippet', () => {
    assert.ok(content.includes('children'), 'Should accept children prop');
    assert.ok(content.includes('@render'), 'Should use @render for children');
  });

  it('Button.svelte has transition styling', () => {
    assert.ok(content.includes('transition'), 'Should have transition classes');
  });

  it('Button.svelte has focus styling', () => {
    assert.ok(content.includes('focus:'), 'Should have focus state classes');
    assert.ok(content.includes('focus:ring'), 'Should have focus ring');
  });
});
