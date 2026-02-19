import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const layoutPath = join(projectRoot, 'apps', 'hub', 'src', 'routes', '+layout.svelte');
const content = existsSync(layoutPath) ? readFileSync(layoutPath, 'utf8') : '';

describe('hub layout svelte', () => {
  it('+layout.svelte file exists', () => {
    assert.ok(existsSync(layoutPath), '+layout.svelte should exist at apps/hub/src/routes/+layout.svelte');
  });

  it('+layout.svelte has script section', () => {
    assert.ok(content.includes('<script'), 'Should have opening script tag');
    assert.ok(content.includes('</script>'), 'Should have closing script tag');
  });

  it('+layout.svelte imports app.css', () => {
    assert.ok(
    content.includes("import '../app.css'") || content.includes("import '../app.css';"),
    'Should import app.css from parent directory'
    );
  });

  it('+layout.svelte uses Svelte 5 $props() rune', () => {
    assert.ok(content.includes('$props()'), 'Should use Svelte 5 $props() rune for children');
  });

  it('+layout.svelte destructures data and children from props', () => {
    assert.ok(
    content.includes('children') && content.includes('$props()'),
    'Should destructure children from props'
    );
    assert.ok(content.includes('data'), 'Should destructure data from props for auth');
  });

  it('+layout.svelte has main element', () => {
    assert.ok(content.includes('<main>'), 'Should have main element for content');
    assert.ok(content.includes('</main>'), 'Should close main element');
  });

  it('+layout.svelte renders children with @render', () => {
    assert.ok(
    content.includes('@render children()') || content.includes('{@render children()}'),
    'Should render children using Svelte 5 @render directive'
    );
  });

  it('+layout.svelte has container div', () => {
    assert.ok(content.includes('<div'), 'Should have a container div');
  });

  it('+layout.svelte has min-h-screen for full height', () => {
    assert.ok(content.includes('min-h-screen'), 'Should have min-h-screen for full viewport height');
  });

  it('+layout.svelte has grain overlay for texture', () => {
    assert.ok(content.includes('grain'), 'Should have grain class for visual texture');
  });

  it('+layout.svelte has nav for auth UI', () => {
    assert.ok(content.includes('<nav'), 'Should have nav element for auth UI');
  });
});
