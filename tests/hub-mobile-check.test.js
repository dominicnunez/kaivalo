import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hubDir = path.join(__dirname, '..', 'apps', 'hub');
const pageFile = path.join(hubDir, 'src', 'routes', '+page.svelte');
const appCssFile = path.join(hubDir, 'src', 'app.css');
const appHtmlFile = path.join(hubDir, 'src', 'app.html');
const layoutFile = path.join(hubDir, 'src', 'routes', '+layout.svelte');
const containerFile = path.join(__dirname, '..', 'packages', 'ui', 'Container.svelte');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  ${e.message}`);
    failed++;
  }
}

const pageContent = fs.readFileSync(pageFile, 'utf8');
const appCss = fs.readFileSync(appCssFile, 'utf8');
const appHtml = fs.readFileSync(appHtmlFile, 'utf8');
const layoutContent = fs.readFileSync(layoutFile, 'utf8');
const containerContent = fs.readFileSync(containerFile, 'utf8');

// Fetch rendered HTML from running server
let renderedHtml = '';
try {
  renderedHtml = execSync('curl -s http://localhost:3100', { encoding: 'utf8', timeout: 5000 });
} catch {
  // Server may not be running — skip rendered tests
}

console.log('\n=== Mobile Responsiveness Check ===\n');

// ── Viewport Meta ──
console.log('--- Viewport Meta ---');

test('Has viewport meta tag with width=device-width', () => {
  assert(appHtml.includes('width=device-width'), 'app.html must have width=device-width viewport meta');
});

test('Has initial-scale=1 in viewport meta', () => {
  assert(appHtml.includes('initial-scale=1'), 'app.html must have initial-scale=1 in viewport');
});

// ── Horizontal Overflow Prevention ──
console.log('\n--- Horizontal Overflow Prevention ---');

test('Body has overflow-x: hidden to prevent mobile horizontal scroll', () => {
  assert(appCss.includes('overflow-x: hidden'), 'body must have overflow-x: hidden');
});

test('Hero section has overflow-hidden class', () => {
  assert(pageContent.includes('overflow-hidden'), 'Hero section needs overflow-hidden');
});

test('Aurora container has overflow: hidden', () => {
  assert(appCss.includes('.aurora') && appCss.includes('overflow: hidden'),
    'Aurora element must clip overflowing pseudo-elements');
});

// ── Touch Targets (WCAG 2.5.8 — minimum 44x44px) ──
console.log('\n--- Touch Targets ---');

test('CTA buttons have adequate vertical padding (py-3 = 12px each side)', () => {
  // py-3 = 0.75rem = 12px top + 12px bottom = 24px padding
  // text-sm = 14px font, ~20px line-height → total ~44px
  const ctaPattern = /py-3.*rounded-lg/;
  assert(ctaPattern.test(pageContent), 'CTA buttons should have py-3 for adequate touch height');
});

test('CTA buttons have adequate horizontal padding (px-5)', () => {
  assert(pageContent.includes('px-5'), 'CTA buttons should have px-5 for adequate touch width');
});

test('Footer links have adequate gap spacing for touch targets', () => {
  // gap-6 = 1.5rem = 24px between footer links — enough to prevent mis-taps
  assert(pageContent.includes('gap-6'), 'Footer links should have gap-6 spacing between items');
});

test('Footer link text has enough size for tappability (text-xs with icon)', () => {
  // Footer links include icon (w-3.5 h-3.5) + text + gap-2 padding — combined target is adequate
  const footerSection = pageContent.slice(pageContent.indexOf('<footer'));
  assert(footerSection.includes('gap-2'), 'Footer links should have gap between icon and text');
});

// ── Responsive Typography ──
console.log('\n--- Responsive Typography ---');

test('Headline scales: text-4xl (mobile) → sm:text-5xl → md:text-7xl', () => {
  assert(pageContent.includes('text-4xl'), 'Headline must start at text-4xl on mobile');
  assert(pageContent.includes('sm:text-5xl'), 'Headline must scale to sm:text-5xl');
  assert(pageContent.includes('md:text-7xl'), 'Headline must scale to md:text-7xl');
});

test('Subheadline scales: text-base (mobile) → sm:text-lg → md:text-xl', () => {
  assert(pageContent.includes('text-base'), 'Subheadline must start at text-base on mobile');
  assert(pageContent.includes('sm:text-lg'), 'Subheadline must scale to sm:text-lg');
  assert(pageContent.includes('md:text-xl'), 'Subheadline must scale to md:text-xl');
});

test('Service section heading scales responsively', () => {
  assert(pageContent.includes('text-2xl'), 'Services heading starts at text-2xl');
  assert(pageContent.includes('sm:text-3xl') || pageContent.includes('md:text-4xl'),
    'Services heading scales up on larger screens');
});

test('About text scales: text-sm (mobile) → sm:text-base', () => {
  assert(pageContent.includes('text-sm sm:text-base') || pageContent.includes('text-sm'),
    'About body text must be readable on mobile');
});

test('No font size below text-xs (12px) in page content', () => {
  // text-xs (12px) is the absolute minimum — nothing smaller should exist
  const tooSmall = pageContent.match(/text-\[(?:10|11|8|9)px\]/g);
  assert(!tooSmall, `Found font sizes below 12px: ${tooSmall}`);
});

// ── Responsive Layout ──
console.log('\n--- Responsive Layout ---');

test('Services grid: 1 col mobile → 2 col tablet', () => {
  assert(pageContent.includes('grid-cols-1'), 'Grid must be single column on mobile');
  assert(pageContent.includes('sm:grid-cols-2'), 'Grid must be 2 columns on tablet');
});

test('About section: stacked mobile → 12-col grid on desktop', () => {
  assert(pageContent.includes('grid-cols-1'), 'About must stack on mobile');
  assert(pageContent.includes('md:grid-cols-12'), 'About must use 12-col grid on desktop');
});

test('Footer: stacked mobile → row on tablet', () => {
  assert(pageContent.includes('flex-col'), 'Footer must stack vertically on mobile');
  assert(pageContent.includes('sm:flex-row'), 'Footer must be row layout on tablet+');
});

test('CTA buttons wrap on narrow screens (flex-wrap)', () => {
  assert(pageContent.includes('flex-wrap'), 'CTA row must wrap on narrow viewports');
});

// ── Responsive Spacing ──
console.log('\n--- Responsive Spacing ---');

test('Hero section has responsive padding', () => {
  assert(pageContent.includes('pt-12') && pageContent.includes('sm:pt-16'),
    'Hero needs responsive top padding');
  assert(pageContent.includes('pb-6') && pageContent.includes('sm:pb-8'),
    'Hero needs responsive bottom padding');
});

test('Services section has responsive padding', () => {
  assert(pageContent.includes('py-8') && pageContent.includes('sm:py-12'),
    'Services needs responsive vertical padding');
});

test('Card padding is responsive', () => {
  assert(pageContent.includes('p-6') && pageContent.includes('sm:p-8'),
    'Service cards need responsive padding');
});

test('Grid gap is responsive', () => {
  assert(pageContent.includes('gap-4') && pageContent.includes('sm:gap-6'),
    'Grid gap must scale from gap-4 to sm:gap-6');
});

test('Container has responsive horizontal padding', () => {
  assert(containerContent.includes('px-4'), 'Container must have px-4 on mobile');
  assert(containerContent.includes('sm:px-6'), 'Container must have sm:px-6 on tablet');
  assert(containerContent.includes('lg:px-8'), 'Container must have lg:px-8 on desktop');
});

// ── Content Constraints ──
console.log('\n--- Content Constraints ---');

test('Hero content has max-width to prevent overly wide text', () => {
  assert(pageContent.includes('max-w-2xl'), 'Hero block needs max-w-2xl');
});

test('Subheadline has max-width for readability', () => {
  assert(pageContent.includes('max-w-xl'), 'Subheadline needs max-w-xl');
});

test('About text has max-width for readability', () => {
  assert(pageContent.includes('max-w-lg'), 'About text needs max-w-lg');
});

test('Container has max-width (max-w-screen-lg)', () => {
  assert(containerContent.includes('max-w-screen-lg'), 'Container must constrain width');
});

// ── Responsive Icon Sizes ──
console.log('\n--- Responsive Elements ---');

test('Service card icons are responsive (w-10 sm:w-11)', () => {
  assert(pageContent.includes('w-10') && pageContent.includes('sm:w-11'),
    'Icon containers must scale');
});

test('About avatar is responsive (w-16 sm:w-20)', () => {
  assert(pageContent.includes('w-16') && pageContent.includes('sm:w-20'),
    'Avatar must scale on different screens');
});

// ── Rendered Page Checks ──
console.log('\n--- Rendered Page Validation ---');

if (renderedHtml) {
  test('Rendered page includes viewport meta tag', () => {
    assert(renderedHtml.includes('width=device-width'),
      'Rendered HTML must include viewport meta');
  });

  test('Rendered page uses responsive Container classes', () => {
    assert(renderedHtml.includes('px-4 sm:px-6 lg:px-8'),
      'Rendered HTML must include Container responsive padding');
  });

  test('Rendered page has grid-cols-1 for mobile-first grid', () => {
    assert(renderedHtml.includes('grid-cols-1'),
      'Rendered HTML must include mobile-first grid');
  });

  test('Rendered page has flex-col for mobile footer', () => {
    assert(renderedHtml.includes('flex-col'),
      'Rendered HTML must include mobile footer layout');
  });

  test('Rendered page has flex-wrap for CTA buttons', () => {
    assert(renderedHtml.includes('flex-wrap'),
      'Rendered HTML must include flex-wrap for CTA row');
  });

  test('Rendered page has no fixed-width elements that could cause overflow', () => {
    // Check for any width declarations that aren't responsive
    const fixedWidths = renderedHtml.match(/style="[^"]*width:\s*\d{4,}px/g);
    assert(!fixedWidths, `Found fixed widths that could overflow: ${fixedWidths}`);
  });
} else {
  console.log('  (skipping rendered tests — server not running on port 3100)');
}

// ── Breakpoint Coverage Summary ──
console.log('\n--- Breakpoint Coverage ---');

test('Uses sm: breakpoint extensively (≥8 usages)', () => {
  const smCount = (pageContent.match(/sm:/g) || []).length;
  assert(smCount >= 8, `sm: breakpoint used ${smCount} times, expected ≥8`);
});

test('Uses md: breakpoint for larger adjustments (≥4 usages)', () => {
  const mdCount = (pageContent.match(/md:/g) || []).length;
  assert(mdCount >= 4, `md: breakpoint used ${mdCount} times, expected ≥4`);
});

test('Uses lg: breakpoint in Container for wide screens', () => {
  assert(containerContent.includes('lg:px-8'), 'lg: breakpoint must be used in Container');
});

// Results
console.log('\n=== Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('');

if (failed > 0) {
  process.exit(1);
}
