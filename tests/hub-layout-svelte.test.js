import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const layoutPath = join(projectRoot, 'apps', 'hub', 'src', 'routes', '+layout.svelte');

let testCount = 0;
let passCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  ${err.message}`);
  }
}

console.log('Testing apps/hub/src/routes/+layout.svelte...\n');

test('+layout.svelte file exists', () => {
  assert.ok(existsSync(layoutPath), '+layout.svelte should exist at apps/hub/src/routes/+layout.svelte');
});

const content = existsSync(layoutPath) ? readFileSync(layoutPath, 'utf8') : '';

test('+layout.svelte has script section', () => {
  assert.ok(content.includes('<script'), 'Should have opening script tag');
  assert.ok(content.includes('</script>'), 'Should have closing script tag');
});

test('+layout.svelte imports app.css', () => {
  assert.ok(
    content.includes("import '../app.css'") || content.includes("import '../app.css';"),
    'Should import app.css from parent directory'
  );
});

test('+layout.svelte uses Svelte 5 $props() rune', () => {
  assert.ok(content.includes('$props()'), 'Should use Svelte 5 $props() rune for children');
});

test('+layout.svelte destructures data and children from props', () => {
  assert.ok(
    content.includes('children') && content.includes('$props()'),
    'Should destructure children from props'
  );
  assert.ok(content.includes('data'), 'Should destructure data from props for auth');
});

test('+layout.svelte has main element', () => {
  assert.ok(content.includes('<main>'), 'Should have main element for content');
  assert.ok(content.includes('</main>'), 'Should close main element');
});

test('+layout.svelte renders children with @render', () => {
  assert.ok(
    content.includes('@render children()') || content.includes('{@render children()}'),
    'Should render children using Svelte 5 @render directive'
  );
});

test('+layout.svelte has container div', () => {
  assert.ok(content.includes('<div'), 'Should have a container div');
});

test('+layout.svelte has min-h-screen for full height', () => {
  assert.ok(content.includes('min-h-screen'), 'Should have min-h-screen for full viewport height');
});

test('+layout.svelte has grain overlay for texture', () => {
  assert.ok(content.includes('grain'), 'Should have grain class for visual texture');
});

test('+layout.svelte has nav for auth UI', () => {
  assert.ok(content.includes('<nav'), 'Should have nav element for auth UI');
});

console.log(`\n${passCount}/${testCount} tests passed`);

if (passCount !== testCount) {
  process.exit(1);
}
