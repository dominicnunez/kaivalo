import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubDir = path.join(__dirname, '..', 'apps', 'hub');
const pageFile = path.join(hubDir, 'src', 'routes', '+page.svelte');
const layoutFile = path.join(hubDir, 'src', 'routes', '+layout.svelte');
const containerFile = path.join(__dirname, '..', 'packages', 'ui', 'Container.svelte');
const pageContent = fs.readFileSync(pageFile, 'utf8');
const layoutContent = fs.readFileSync(layoutFile, 'utf8');
const containerContent = fs.readFileSync(containerFile, 'utf8');

describe('hub responsive design', () => {
  it('Container has mobile padding (px-4)', () => {
    assert(containerContent.includes('px-4'), 'Container should have px-4 for mobile');
  });

  it('Container has tablet padding (sm:px-6)', () => {
    assert(containerContent.includes('sm:px-6'), 'Container should have sm:px-6 for tablet');
  });

  it('Container has desktop padding (lg:px-8)', () => {
    assert(containerContent.includes('lg:px-8'), 'Container should have lg:px-8 for desktop');
  });

  it('Container has responsive max-width options', () => {
    assert(containerContent.includes('max-w-screen-sm'), 'Container should have sm max-width');
    assert(containerContent.includes('max-w-screen-lg'), 'Container should have lg max-width');
  });

  it('Container has centering (mx-auto)', () => {
    assert(containerContent.includes('mx-auto'), 'Container should have mx-auto for centering');
  });

  it('Hero headline has mobile text size (text-4xl)', () => {
    assert(pageContent.includes('text-4xl'), 'Hero headline should have text-4xl for mobile');
  });

  it('Hero headline has tablet text size (sm:text-5xl)', () => {
    assert(pageContent.includes('sm:text-5xl'), 'Hero headline should have sm:text-5xl for tablet');
  });

  it('Hero headline has desktop text size (md:text-7xl)', () => {
    assert(pageContent.includes('md:text-7xl'), 'Hero headline should have md:text-7xl for desktop');
  });

  it('Hero subheadline has responsive sizes', () => {
    assert(pageContent.includes('sm:text-lg') || pageContent.includes('md:text-xl'), 'Hero subheadline should have responsive sizes');
  });

  it('Hero content has max-width constraint', () => {
    assert(pageContent.includes('max-w-2xl') || pageContent.includes('max-w-xl'), 'Hero content should have max-width');
  });

  it('Services grid has mobile layout (grid-cols-1)', () => {
    assert(pageContent.includes('grid-cols-1'), 'Services grid should have grid-cols-1 for mobile');
  });

  it('Services grid has tablet layout (sm:grid-cols-2)', () => {
    assert(pageContent.includes('sm:grid-cols-2'), 'Services grid should have sm:grid-cols-2 for tablet');
  });

  it('Services grid has gap for spacing', () => {
    assert(pageContent.includes('gap-4') || pageContent.includes('gap-6'), 'Services grid should have gap');
  });

  it('Services grid uses CSS Grid', () => {
    assert(pageContent.includes('grid'), 'Services grid should use grid display');
  });

  it('About has responsive typography', () => {
    assert(pageContent.includes('sm:text-2xl') || pageContent.includes('text-xl'), 'About should have responsive typography');
  });

  it('About content has max-width for readability', () => {
    assert(pageContent.includes('max-w-lg') || pageContent.includes('max-w-xl'), 'About content should have max-width');
  });

  it('About uses responsive grid layout', () => {
    assert(pageContent.includes('md:grid-cols-12') || pageContent.includes('md:grid-cols-2'), 'About should use responsive grid');
  });

  it('Footer has mobile layout (flex-col)', () => {
    assert(pageContent.includes('flex-col'), 'Footer should have flex-col for mobile');
  });

  it('Footer has tablet+ layout (sm:flex-row)', () => {
    assert(pageContent.includes('sm:flex-row'), 'Footer should have sm:flex-row for tablet+');
  });

  it('Footer has justify-between', () => {
    assert(pageContent.includes('justify-between'), 'Footer should have justify-between');
  });

  it('Footer has padding (py-8)', () => {
    assert(pageContent.includes('py-8'), 'Footer should have py-8 padding');
  });

  it('Layout has minimum screen height (min-h-screen)', () => {
    assert(layoutContent.includes('min-h-screen'), 'Layout should have min-h-screen');
  });

  it('Mobile breakpoint (default) is covered', () => {
    assert(pageContent.includes('text-4xl'), 'Mobile: has mobile-first text sizes');
    assert(pageContent.includes('grid-cols-1'), 'Mobile: has single column grid');
    assert(pageContent.includes('flex-col'), 'Mobile: has stacked flex layout');
  });

  it('Small breakpoint (sm:) is covered', () => {
    const smBreakpoints = pageContent.match(/sm:[a-zA-Z0-9-[\]]+/g) || [];
    assert(smBreakpoints.length >= 4, `sm: breakpoint should have multiple uses, found ${smBreakpoints.length}`);
  });

  it('Medium breakpoint (md:) is covered', () => {
    const mdBreakpoints = pageContent.match(/md:[a-zA-Z0-9-[\]]+/g) || [];
    assert(mdBreakpoints.length >= 2, `md: breakpoint should have multiple uses, found ${mdBreakpoints.length}`);
  });
});
