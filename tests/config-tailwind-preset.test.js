import { strict as assert } from 'assert';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const presetPath = join(projectRoot, 'packages', 'config', 'tailwind.preset.js');

// Simple test runner
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.log(`✗ ${name}`);
      console.log(`  ${error.message}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

// Test: File exists
test('tailwind.preset.js exists', () => {
  assert.ok(existsSync(presetPath), 'tailwind.preset.js should exist');
});

// Read file content for structure tests
let content = '';
try {
  content = readFileSync(presetPath, 'utf-8');
} catch (e) {
  // File will be created, tests will handle missing file
}

// Test: Exports default config
test('exports default config', () => {
  assert.ok(content.includes('export default'), 'Should use ES module default export');
});

// Test: Has theme.extend structure
test('has theme.extend structure', () => {
  assert.ok(content.includes('theme:'), 'Should have theme property');
  assert.ok(content.includes('extend:'), 'Should have extend property');
});

// Test: Has colors configuration
test('has colors configuration', () => {
  assert.ok(content.includes('colors:'), 'Should have colors configuration');
});

// Test: Has primary color (blue-600 based)
test('has primary brand color (blue-600)', () => {
  assert.ok(content.includes('primary:'), 'Should have primary color');
  assert.ok(content.includes('#2563eb'), 'Primary should use blue-600 (#2563eb)');
});

// Test: Has accent color (emerald-500 based)
test('has accent color (emerald-500)', () => {
  assert.ok(content.includes('accent:'), 'Should have accent color');
  assert.ok(content.includes('#10b981'), 'Accent should use emerald-500 (#10b981)');
});

// Test: Has neutral grays
test('has neutral gray palette', () => {
  assert.ok(content.includes('neutral:'), 'Should have neutral color');
  // Check for some neutral color values
  assert.ok(content.includes('#fafafa'), 'Should have neutral-50');
  assert.ok(content.includes('#171717'), 'Should have neutral-900');
});

// Test: Has fontFamily configuration
test('has fontFamily configuration', () => {
  assert.ok(content.includes('fontFamily:'), 'Should have fontFamily configuration');
});

// Test: Uses Inter font with system fallbacks
test('uses Inter font with system fallbacks', () => {
  assert.ok(content.includes("'Inter'"), 'Should include Inter font');
  assert.ok(content.includes('sans:'), 'Should define sans font family');
  assert.ok(content.includes('system-ui'), 'Should include system-ui fallback');
  assert.ok(content.includes('sans-serif'), 'Should include sans-serif fallback');
});

// Test: Has animation utilities
test('has animation utilities', () => {
  assert.ok(content.includes('animation:'), 'Should have animation utilities');
});

// Test: Has keyframes for animations
test('has keyframes for animations', () => {
  assert.ok(content.includes('keyframes:'), 'Should have keyframes');
});

// Test: Has fade-in animation
test('has fade-in animation', () => {
  assert.ok(content.includes("'fade-in'"), 'Should have fade-in animation');
  assert.ok(content.includes('fadeIn:'), 'Should have fadeIn keyframes');
});

// Test: Has hover-lift animation for subtle hover effects
test('has hover-lift animation for subtle hover effects', () => {
  assert.ok(content.includes("'hover-lift'"), 'Should have hover-lift animation');
  assert.ok(content.includes('hoverLift:'), 'Should have hoverLift keyframes');
});

// Test: Has slide animations
test('has slide animations', () => {
  assert.ok(content.includes("'slide-up'"), 'Should have slide-up animation');
  assert.ok(content.includes("'slide-down'"), 'Should have slide-down animation');
});

// Test: Has scale-in animation
test('has scale-in animation', () => {
  assert.ok(content.includes("'scale-in'"), 'Should have scale-in animation');
  assert.ok(content.includes('scaleIn:'), 'Should have scaleIn keyframes');
});

// Test: Has DEFAULT values for primary and accent
test('has DEFAULT values for brand colors', () => {
  // Check that DEFAULT is set for easy access (e.g., bg-primary instead of bg-primary-600)
  const primarySection = content.substring(content.indexOf('primary:'), content.indexOf('accent:'));
  assert.ok(primarySection.includes('DEFAULT:'), 'Primary should have DEFAULT value');

  const accentSection = content.substring(content.indexOf('accent:'), content.indexOf('neutral:'));
  assert.ok(accentSection.includes('DEFAULT:'), 'Accent should have DEFAULT value');
});

// Test: Has complete color scales (50-950)
test('has complete color scales for brand colors', () => {
  // Check for typical Tailwind color scale steps
  assert.ok(content.includes('50:'), 'Should have 50 shade');
  assert.ok(content.includes('100:'), 'Should have 100 shade');
  assert.ok(content.includes('500:'), 'Should have 500 shade');
  assert.ok(content.includes('900:'), 'Should have 900 shade');
  assert.ok(content.includes('950:'), 'Should have 950 shade');
});

// Test: Import can be loaded as ES module
test('is valid ES module syntax', async () => {
  // Dynamically import to verify it's valid
  const preset = await import(presetPath);
  assert.ok(preset.default, 'Should have default export');
  assert.ok(preset.default.theme, 'Default export should have theme property');
  assert.ok(preset.default.theme.extend, 'Theme should have extend property');
});

// Test: Colors are properly structured
test('color configuration is properly structured', async () => {
  const preset = await import(presetPath);
  const colors = preset.default.theme.extend.colors;

  assert.ok(colors.primary, 'Should have primary color');
  assert.ok(colors.accent, 'Should have accent color');
  assert.ok(colors.neutral, 'Should have neutral color');
  assert.strictEqual(colors.primary.DEFAULT, '#2563eb', 'Primary DEFAULT should be blue-600');
  assert.strictEqual(colors.accent.DEFAULT, '#10b981', 'Accent DEFAULT should be emerald-500');
});

// Test: FontFamily is properly structured
test('fontFamily is properly structured', async () => {
  const preset = await import(presetPath);
  const fontFamily = preset.default.theme.extend.fontFamily;

  assert.ok(fontFamily.sans, 'Should have sans font family');
  assert.ok(Array.isArray(fontFamily.sans), 'Sans should be an array');
  assert.strictEqual(fontFamily.sans[0], 'Inter', 'First font should be Inter');
});

// Test: Animations are properly structured
test('animations are properly structured', async () => {
  const preset = await import(presetPath);
  const animation = preset.default.theme.extend.animation;
  const keyframes = preset.default.theme.extend.keyframes;

  assert.ok(animation['fade-in'], 'Should have fade-in animation');
  assert.ok(animation['hover-lift'], 'Should have hover-lift animation');
  assert.ok(keyframes.fadeIn, 'Should have fadeIn keyframes');
  assert.ok(keyframes.hoverLift, 'Should have hoverLift keyframes');
});

runTests();
