import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const pagePath = path.join(projectRoot, 'apps/hub/src/routes/+page.svelte');
const pageContent = fs.readFileSync(pagePath, 'utf-8');
// File structure tests

describe('hub hero section', () => {
  it('page.svelte exists', () => {
    assert.ok(fs.existsSync(pagePath));
  });

  it('page has script section with lang=ts', () => {
    assert.ok(pageContent.includes('<script lang="ts">'));
  });

  it('imports Container from @kaivalo/ui', () => {
    assert.ok(pageContent.includes('Container') && pageContent.includes("'@kaivalo/ui'"));
  });

  it('imports icons from lucide-svelte', () => {
    assert.ok(pageContent.includes('lucide-svelte'));
    assert.ok(pageContent.includes('Wrench'));
  });

  it('has hero section element', () => {
    assert.ok(pageContent.includes('<section') && pageContent.includes('HERO'));
  });

  it('hero has aurora background', () => {
    assert.ok(pageContent.includes('aurora'));
  });

  it('hero uses flex items-center', () => {
    assert.ok(pageContent.includes('flex') && pageContent.includes('items-center'));
  });

  it('has headline text', () => {
    assert.ok(pageContent.includes('Tools that') && pageContent.includes('solve things'));
  });

  it('headline is h1 element', () => {
    assert.ok(pageContent.includes('<h1'));
  });

  it('headline has responsive font sizes', () => {
    assert.ok(pageContent.includes('text-4xl') && pageContent.includes('sm:text-5xl') && pageContent.includes('md:text-7xl'));
  });

  it('headline has font-bold', () => {
    assert.ok(pageContent.includes('font-bold'));
  });

  it('headline uses font-display class', () => {
    assert.ok(pageContent.includes('font-display'));
  });

  it('has subheadline text', () => {
    assert.ok(pageContent.includes('Simple tools for complicated problems'));
  });

  it('subheadline has responsive font sizes', () => {
    assert.ok(pageContent.includes('text-base') || pageContent.includes('sm:text-lg') || pageContent.includes('md:text-xl'));
  });

  it('subheadline has max-width constraint', () => {
    assert.ok(pageContent.includes('max-w-xl') || pageContent.includes('max-w-2xl'));
  });

  it('has CTA link to services', () => {
    assert.ok(pageContent.includes('href="#services"'));
  });

  it('CTA text says "See what\'s live"', () => {
    assert.ok(pageContent.includes("See what's live") || pageContent.includes('See what'));
  });

  it('has secondary CTA link to about', () => {
    assert.ok(pageContent.includes('href="#about"'));
  });

  it('has Helsinki location tag', () => {
    assert.ok(pageContent.includes('Helsinki'));
  });

  it('has entrance animations', () => {
    assert.ok(pageContent.includes('animate-enter'));
  });

  it('has services section with id="services"', () => {
    assert.ok(pageContent.includes('id="services"'));
  });

  it('has at least 3 section elements', () => {
    const sectionMatches = pageContent.match(/<section/g);
    assert.ok(sectionMatches && sectionMatches.length >= 3);
  });

  it('uses Container component for layout', () => {
    assert.ok(pageContent.includes('<Container'));
  });

  it('Container has size="lg" prop', () => {
    assert.ok(pageContent.includes('size="lg"'));
  });
});
