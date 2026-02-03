/**
 * Tests for apps/hub Footer section
 * Validates the footer has copyright, GitHub link, and contact link
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const testResults = [];
function test(name, fn) {
  try {
    fn();
    testResults.push({ name, passed: true });
    console.log(`✓ ${name}`);
  } catch (error) {
    testResults.push({ name, passed: false, error: error.message });
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
  }
}

const pageFilePath = path.join(process.cwd(), 'apps/hub/src/routes/+page.svelte');
const pageContent = fs.readFileSync(pageFilePath, 'utf8');

// Footer section tests
test('Footer section exists with <footer> element', () => {
  assert.ok(pageContent.includes('<footer'), 'Page should contain <footer> element');
});

test('Footer has closing tag', () => {
  assert.ok(pageContent.includes('</footer>'), 'Page should have closing </footer> tag');
});

test('Footer has dark background styling', () => {
  assert.ok(pageContent.includes('bg-gray-900'), 'Footer should have dark background (bg-gray-900)');
});

test('Footer has light text color', () => {
  assert.ok(pageContent.includes('text-gray-300'), 'Footer should have light text color (text-gray-300)');
});

test('Footer has padding', () => {
  assert.ok(pageContent.includes('py-8') || pageContent.includes('py-6') || pageContent.includes('py-10'),
    'Footer should have vertical padding');
});

// Copyright tests
test('Footer contains copyright year 2026', () => {
  assert.ok(pageContent.includes('2026'), 'Footer should contain year 2026');
});

test('Footer contains "Kai Valo" in copyright', () => {
  assert.ok(pageContent.includes('Kai Valo'), 'Footer should contain "Kai Valo"');
});

test('Footer has copyright symbol', () => {
  assert.ok(pageContent.includes('©'), 'Footer should contain copyright symbol ©');
});

test('Footer has full copyright text', () => {
  assert.ok(pageContent.includes('© 2026 Kai Valo'), 'Footer should have "© 2026 Kai Valo"');
});

// GitHub link tests
test('Footer has GitHub link', () => {
  assert.ok(pageContent.includes('github.com'), 'Footer should have GitHub link');
});

test('Footer has GitHub icon import', () => {
  assert.ok(pageContent.includes('Github'), 'Page should import Github icon from lucide-svelte');
});

test('Footer GitHub link opens in new tab', () => {
  assert.ok(pageContent.includes('target="_blank"'), 'GitHub link should open in new tab');
});

test('Footer GitHub link has security attributes', () => {
  assert.ok(pageContent.includes('rel="noopener noreferrer"'),
    'GitHub link should have rel="noopener noreferrer" for security');
});

test('Footer has GitHub text label', () => {
  assert.ok(pageContent.includes('>GitHub<'), 'Footer should display "GitHub" text');
});

// Contact link tests
test('Footer has mailto link', () => {
  assert.ok(pageContent.includes('mailto:'), 'Footer should have mailto link');
});

test('Footer has correct email address', () => {
  assert.ok(pageContent.includes('kaievalo@proton.me'), 'Footer should link to kaievalo@proton.me');
});

test('Footer has full mailto href', () => {
  assert.ok(pageContent.includes('href="mailto:kaievalo@proton.me"'),
    'Footer should have full mailto href');
});

test('Footer has Mail icon import', () => {
  assert.ok(pageContent.includes('Mail'), 'Page should import Mail icon from lucide-svelte');
});

test('Footer has Contact text label', () => {
  assert.ok(pageContent.includes('>Contact<'), 'Footer should display "Contact" text');
});

// Layout tests
test('Footer uses Container component', () => {
  const footerSection = pageContent.substring(pageContent.indexOf('<footer'), pageContent.indexOf('</footer>'));
  assert.ok(footerSection.includes('<Container'), 'Footer should use Container component');
});

test('Footer has flex layout', () => {
  assert.ok(pageContent.includes('flex') && pageContent.includes('items-center'),
    'Footer should use flex layout with centered items');
});

test('Footer has responsive layout', () => {
  assert.ok(pageContent.includes('sm:flex-row') || pageContent.includes('flex-col'),
    'Footer should have responsive layout (flex-col on mobile, flex-row on larger)');
});

test('Footer links have hover effect', () => {
  assert.ok(pageContent.includes('hover:text-white'),
    'Footer links should have hover effect');
});

test('Footer links have transition', () => {
  assert.ok(pageContent.includes('transition-colors'),
    'Footer links should have transition for smooth color change');
});

// Icon sizing tests
test('Footer icons have consistent size', () => {
  const footerSection = pageContent.substring(pageContent.indexOf('<footer'), pageContent.indexOf('</footer>'));
  assert.ok(footerSection.includes('w-4 h-4'), 'Footer icons should be w-4 h-4 size');
});

// Position test
test('Footer is at the end of the page', () => {
  const lastSectionIndex = pageContent.lastIndexOf('</section>');
  const footerIndex = pageContent.indexOf('<footer');
  assert.ok(footerIndex > lastSectionIndex, 'Footer should come after all sections');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Total: ${testResults.length} tests`);
console.log(`Passed: ${testResults.filter(t => t.passed).length}`);
console.log(`Failed: ${testResults.filter(t => !t.passed).length}`);

if (testResults.some(t => !t.passed)) {
  process.exit(1);
}
