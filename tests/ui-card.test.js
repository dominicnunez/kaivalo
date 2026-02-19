import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const cardPath = join(rootDir, 'packages', 'ui', 'Card.svelte');
let content;

describe('ui card', () => {
  it('Card.svelte exists', () => {
    assert.ok(existsSync(cardPath), 'Card.svelte should exist');
  });

  it('Card.svelte is readable', () => {
    content = readFileSync(cardPath, 'utf-8');
    assert.ok(content, 'Should be able to read Card.svelte');
  });

  it('Card.svelte has script section', () => {
    assert.ok(content.includes('<script>'), 'Should have script opening tag');
    assert.ok(content.includes('</script>'), 'Should have script closing tag');
  });

  it('Card.svelte uses Svelte 5 $props rune', () => {
    assert.ok(content.includes('$props()'), 'Should use $props() rune for props');
  });

  it('Card.svelte has variant prop with default variant', () => {
    assert.ok(content.includes('variant'), 'Should have variant prop');
    assert.ok(content.includes("variant = 'default'"), 'Should default to default variant');
  });

  it('Card.svelte supports link variant', () => {
    assert.ok(content.includes("'link'"), 'Should support link variant');
    assert.ok(content.includes('linkClasses'), 'Should have link-specific classes');
  });

  it('Card.svelte has href prop for link variant', () => {
    assert.ok(content.includes('href'), 'Should have href prop');
    assert.ok(content.includes('{href}'), 'Should bind href to anchor element');
  });

  it('Card.svelte has optional header prop', () => {
    assert.ok(content.includes('header'), 'Should have header prop');
    assert.ok(content.includes("header = ''"), 'Should default header to empty string');
  });

  it('Card.svelte renders header when provided', () => {
    assert.ok(content.includes('{#if header}'), 'Should conditionally render header');
    assert.ok(content.includes('border-b'), 'Header should have bottom border');
    assert.ok(content.includes('{header}'), 'Should render header content');
  });

  it('Card.svelte has hover prop', () => {
    assert.ok(content.includes('hover'), 'Should have hover prop');
    assert.ok(content.includes('hover = true'), 'Should default hover to true');
  });

  it('Card.svelte has hover effect classes', () => {
    assert.ok(content.includes('hover:shadow'), 'Should have hover shadow effect');
    assert.ok(content.includes('transition'), 'Should have transition for smooth hover');
  });

  it('Card.svelte uses $derived for computed classes', () => {
    assert.ok(content.includes('$derived'), 'Should use $derived rune for computed classes');
  });

  it('Card.svelte has container styling', () => {
    assert.ok(content.includes('bg-white'), 'Should have white background');
    assert.ok(content.includes('rounded'), 'Should have rounded corners');
    assert.ok(content.includes('border'), 'Should have border');
  });

  it('Card.svelte renders as anchor for link variant', () => {
    assert.ok(content.includes('<a'), 'Should have anchor element for link variant');
    assert.ok(content.includes('</a>'), 'Should close anchor element');
    assert.ok(content.includes('isLink'), 'Should check if link variant');
  });

  it('Card.svelte renders as div for default variant', () => {
    assert.ok(content.includes('<div'), 'Should have div element');
    assert.ok(content.includes('{:else}'), 'Should have else block for non-link rendering');
  });

  it('Card.svelte supports children via snippet', () => {
    assert.ok(content.includes('children'), 'Should accept children prop');
    assert.ok(content.includes('@render'), 'Should use @render for children');
  });

  it('Card.svelte has content padding', () => {
    assert.ok(content.includes('p-6'), 'Should have padding for content area');
  });

  it('Card.svelte has cursor-pointer for link variant', () => {
    assert.ok(content.includes('cursor-pointer'), 'Should have pointer cursor for link variant');
  });
});
