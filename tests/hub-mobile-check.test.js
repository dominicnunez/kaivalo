import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const hubDir = path.resolve(import.meta.dirname, '..', 'apps', 'hub');
const pageFile = path.join(hubDir, 'src', 'routes', '+page.svelte');
const appCssFile = path.join(hubDir, 'src', 'app.css');
const appHtmlFile = path.join(hubDir, 'src', 'app.html');
const containerFile = path.resolve(import.meta.dirname, '..', 'packages', 'ui', 'Container.svelte');

const pageContent = fs.readFileSync(pageFile, 'utf8');
const appCss = fs.readFileSync(appCssFile, 'utf8');
const appHtml = fs.readFileSync(appHtmlFile, 'utf8');
const containerContent = fs.readFileSync(containerFile, 'utf8');

// Fetch rendered HTML from running server
let renderedHtml = '';
try {
  renderedHtml = execSync('curl -s http://localhost:3100', { encoding: 'utf8', timeout: 5000 });
} catch {
  // Server may not be running — rendered tests will be skipped
}

describe('viewport meta', () => {
  it('has viewport meta tag with width=device-width', () => {
    assert.ok(appHtml.includes('width=device-width'), 'app.html must have width=device-width viewport meta');
  });

  it('has initial-scale=1 in viewport meta', () => {
    assert.ok(appHtml.includes('initial-scale=1'), 'app.html must have initial-scale=1 in viewport');
  });
});

describe('horizontal overflow prevention', () => {
  it('body has overflow-x: hidden to prevent mobile horizontal scroll', () => {
    assert.ok(appCss.includes('overflow-x: hidden'), 'body must have overflow-x: hidden');
  });

  it('hero section has overflow-hidden class', () => {
    assert.ok(pageContent.includes('overflow-hidden'), 'Hero section needs overflow-hidden');
  });

  it('aurora container has overflow: hidden', () => {
    assert.ok(appCss.includes('.aurora') && appCss.includes('overflow: hidden'),
      'Aurora element must clip overflowing pseudo-elements');
  });
});

describe('touch targets (WCAG 2.5.8)', () => {
  it('CTA buttons have adequate vertical padding (py-3)', () => {
    const ctaPattern = /py-3.*rounded-lg/;
    assert.ok(ctaPattern.test(pageContent), 'CTA buttons should have py-3 for adequate touch height');
  });

  it('CTA buttons have adequate horizontal padding (px-5)', () => {
    assert.ok(pageContent.includes('px-5'), 'CTA buttons should have px-5 for adequate touch width');
  });

  it('footer links have adequate gap spacing for touch targets', () => {
    assert.ok(pageContent.includes('gap-6'), 'Footer links should have gap-6 spacing between items');
  });

  it('footer link text has enough size for tappability', () => {
    const footerSection = pageContent.slice(pageContent.indexOf('<footer'));
    assert.ok(footerSection.includes('gap-2'), 'Footer links should have gap between icon and text');
  });
});

describe('responsive typography', () => {
  it('headline scales: text-4xl → sm:text-5xl → md:text-7xl', () => {
    assert.ok(pageContent.includes('text-4xl'), 'Headline must start at text-4xl on mobile');
    assert.ok(pageContent.includes('sm:text-5xl'), 'Headline must scale to sm:text-5xl');
    assert.ok(pageContent.includes('md:text-7xl'), 'Headline must scale to md:text-7xl');
  });

  it('subheadline scales: text-base → sm:text-lg → md:text-xl', () => {
    assert.ok(pageContent.includes('text-base'), 'Subheadline must start at text-base on mobile');
    assert.ok(pageContent.includes('sm:text-lg'), 'Subheadline must scale to sm:text-lg');
    assert.ok(pageContent.includes('md:text-xl'), 'Subheadline must scale to md:text-xl');
  });

  it('service section heading scales at both breakpoints', () => {
    assert.ok(pageContent.includes('text-2xl'), 'Services heading starts at text-2xl');
    assert.ok(pageContent.includes('sm:text-3xl'), 'Services heading scales at sm breakpoint');
    assert.ok(pageContent.includes('md:text-4xl'), 'Services heading scales at md breakpoint');
  });

  it('about text scales: text-sm → sm:text-base', () => {
    assert.ok(pageContent.includes('text-sm sm:text-base') || pageContent.includes('text-sm'),
      'About body text must be readable on mobile');
  });

  it('no font size below text-xs (12px) in page content', () => {
    const tooSmall = pageContent.match(/text-\[(?:10|11|8|9)px\]/g);
    assert.ok(!tooSmall, `Found font sizes below 12px: ${tooSmall}`);
  });
});

describe('responsive layout', () => {
  it('services grid: 1 col mobile → 2 col tablet', () => {
    assert.ok(pageContent.includes('grid-cols-1'), 'Grid must be single column on mobile');
    assert.ok(pageContent.includes('sm:grid-cols-2'), 'Grid must be 2 columns on tablet');
  });

  it('about section: stacked mobile → 12-col grid on desktop', () => {
    assert.ok(pageContent.includes('grid-cols-1'), 'About must stack on mobile');
    assert.ok(pageContent.includes('md:grid-cols-12'), 'About must use 12-col grid on desktop');
  });

  it('footer: stacked mobile → row on tablet', () => {
    assert.ok(pageContent.includes('flex-col'), 'Footer must stack vertically on mobile');
    assert.ok(pageContent.includes('sm:flex-row'), 'Footer must be row layout on tablet+');
  });

  it('CTA buttons wrap on narrow screens (flex-wrap)', () => {
    assert.ok(pageContent.includes('flex-wrap'), 'CTA row must wrap on narrow viewports');
  });
});

describe('responsive spacing', () => {
  it('hero section has responsive padding', () => {
    assert.ok(pageContent.includes('pt-12') && pageContent.includes('sm:pt-16'),
      'Hero needs responsive top padding');
    assert.ok(pageContent.includes('pb-6') && pageContent.includes('sm:pb-8'),
      'Hero needs responsive bottom padding');
  });

  it('services section has responsive padding', () => {
    assert.ok(pageContent.includes('py-8') && pageContent.includes('sm:py-12'),
      'Services needs responsive vertical padding');
  });

  it('card padding is responsive', () => {
    assert.ok(pageContent.includes('p-6') && pageContent.includes('sm:p-8'),
      'Service cards need responsive padding');
  });

  it('grid gap is responsive', () => {
    assert.ok(pageContent.includes('gap-4') && pageContent.includes('sm:gap-6'),
      'Grid gap must scale from gap-4 to sm:gap-6');
  });

  it('container has responsive horizontal padding', () => {
    assert.ok(containerContent.includes('px-4'), 'Container must have px-4 on mobile');
    assert.ok(containerContent.includes('sm:px-6'), 'Container must have sm:px-6 on tablet');
    assert.ok(containerContent.includes('lg:px-8'), 'Container must have lg:px-8 on desktop');
  });
});

describe('content constraints', () => {
  it('hero content has max-width to prevent overly wide text', () => {
    assert.ok(pageContent.includes('max-w-2xl'), 'Hero block needs max-w-2xl');
  });

  it('subheadline has max-width for readability', () => {
    assert.ok(pageContent.includes('max-w-xl'), 'Subheadline needs max-w-xl');
  });

  it('about text has max-width for readability', () => {
    assert.ok(pageContent.includes('max-w-lg'), 'About text needs max-w-lg');
  });

  it('container has max-width (max-w-screen-lg)', () => {
    assert.ok(containerContent.includes('max-w-screen-lg'), 'Container must constrain width');
  });
});

describe('responsive elements', () => {
  it('service card icons are responsive (w-10 sm:w-11)', () => {
    assert.ok(pageContent.includes('w-10') && pageContent.includes('sm:w-11'),
      'Icon containers must scale');
  });

  it('about avatar is responsive (w-16 sm:w-20)', () => {
    assert.ok(pageContent.includes('w-16') && pageContent.includes('sm:w-20'),
      'Avatar must scale on different screens');
  });
});

describe('rendered page validation', () => {
  it('rendered page includes viewport meta tag', (t) => {
    if (!renderedHtml) { t.skip('server not running on port 3100'); return; }
    assert.ok(renderedHtml.includes('width=device-width'),
      'Rendered HTML must include viewport meta');
  });

  it('rendered page uses responsive Container classes', (t) => {
    if (!renderedHtml) { t.skip('server not running on port 3100'); return; }
    assert.ok(renderedHtml.includes('px-4 sm:px-6 lg:px-8'),
      'Rendered HTML must include Container responsive padding');
  });

  it('rendered page has grid-cols-1 for mobile-first grid', (t) => {
    if (!renderedHtml) { t.skip('server not running on port 3100'); return; }
    assert.ok(renderedHtml.includes('grid-cols-1'),
      'Rendered HTML must include mobile-first grid');
  });

  it('rendered page has flex-col for mobile footer', (t) => {
    if (!renderedHtml) { t.skip('server not running on port 3100'); return; }
    assert.ok(renderedHtml.includes('flex-col'),
      'Rendered HTML must include mobile footer layout');
  });

  it('rendered page has flex-wrap for CTA buttons', (t) => {
    if (!renderedHtml) { t.skip('server not running on port 3100'); return; }
    assert.ok(renderedHtml.includes('flex-wrap'),
      'Rendered HTML must include flex-wrap for CTA row');
  });

  it('rendered page has no fixed-width elements that could cause overflow', (t) => {
    if (!renderedHtml) { t.skip('server not running on port 3100'); return; }
    const fixedWidths = renderedHtml.match(/style="[^"]*width:\s*\d{4,}px/g);
    assert.ok(!fixedWidths, `Found fixed widths that could overflow: ${fixedWidths}`);
  });
});

describe('breakpoint coverage', () => {
  it('uses sm: breakpoint extensively (>=8 usages)', () => {
    const smCount = (pageContent.match(/sm:/g) || []).length;
    assert.ok(smCount >= 8, `sm: breakpoint used ${smCount} times, expected >=8`);
  });

  it('uses md: breakpoint for larger adjustments (>=4 usages)', () => {
    const mdCount = (pageContent.match(/md:/g) || []).length;
    assert.ok(mdCount >= 4, `md: breakpoint used ${mdCount} times, expected >=4`);
  });

  it('uses lg: breakpoint in Container for wide screens', () => {
    assert.ok(containerContent.includes('lg:px-8'), 'lg: breakpoint must be used in Container');
  });
});
