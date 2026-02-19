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

  it('Button.svelte has scoped primary variant styles', () => {
    assert.ok(content.includes('.btn-primary'), 'Should define .btn-primary class');
    assert.ok(content.includes('var(--accent)'), 'Primary should use --accent CSS variable');
  });

  it('Button.svelte has scoped secondary variant styles', () => {
    assert.ok(content.includes('.btn-secondary'), 'Should define .btn-secondary class');
    assert.ok(content.includes('var(--bg-tertiary)'), 'Secondary should use --bg-tertiary');
  });

  it('Button.svelte has scoped ghost variant styles', () => {
    assert.ok(content.includes('.btn-ghost'), 'Should define .btn-ghost class');
    assert.ok(content.includes('transparent'), 'Ghost should be transparent');
  });

  it('Button.svelte has size prop with md default', () => {
    assert.ok(content.includes('size'), 'Should have size prop');
    assert.ok(content.includes("size = 'md'"), 'Should default to md size');
  });

  it('Button.svelte has scoped size classes', () => {
    assert.ok(content.includes('.btn-sm'), 'Should define .btn-sm class');
    assert.ok(content.includes('.btn-md'), 'Should define .btn-md class');
    assert.ok(content.includes('.btn-lg'), 'Should define .btn-lg class');
  });

  it('Button.svelte has disabled prop', () => {
    assert.ok(content.includes('disabled'), 'Should have disabled prop');
    assert.ok(content.includes('disabled = false'), 'Should default disabled to false');
  });

  it('Button.svelte uses disabled attribute on button', () => {
    assert.ok(content.includes('{disabled}'), 'Should bind disabled attribute');
  });

  it('Button.svelte has disabled styling', () => {
    assert.ok(content.includes(':disabled'), 'Should have :disabled pseudo-class styles');
    assert.ok(content.includes('cursor: not-allowed'), 'Should show not-allowed cursor when disabled');
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
    assert.ok(content.includes('transition'), 'Should have transition in scoped styles');
  });

  it('Button.svelte has focus-visible styling', () => {
    assert.ok(content.includes('focus-visible'), 'Should have focus-visible styles');
    assert.ok(content.includes('outline'), 'Should have outline for focus indicator');
  });

  it('Button.svelte uses scoped style block', () => {
    assert.ok(content.includes('<style>'), 'Should have scoped style block');
    assert.ok(content.includes('</style>'), 'Should close style block');
  });

  it('Button.svelte uses CSS custom properties for theming', () => {
    assert.ok(content.includes('var(--'), 'Should use CSS custom properties');
  });
});
