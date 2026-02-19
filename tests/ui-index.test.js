import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const uiIndexPath = join(rootDir, 'packages', 'ui', 'index.js');
let indexContent;

describe('ui index', () => {
  it('packages/ui/index.js exists', () => {
    assert.ok(existsSync(uiIndexPath), 'packages/ui/index.js should exist');
  });

  it('packages/ui/index.js is readable', () => {
    indexContent = readFileSync(uiIndexPath, 'utf-8');
    assert.ok(indexContent, 'Should be able to read index.js');
  });

  it('index.js exports Button component', () => {
    assert.ok(indexContent.includes("from './Button.svelte'"), 'Should export Button.svelte');
    assert.ok(indexContent.includes('Button'), 'Should have Button export');
  });

  it('index.js exports Card component', () => {
    assert.ok(indexContent.includes("from './Card.svelte'"), 'Should export Card.svelte');
    assert.ok(indexContent.includes('Card'), 'Should have Card export');
  });

  it('index.js exports Badge component', () => {
    assert.ok(indexContent.includes("from './Badge.svelte'"), 'Should export Badge.svelte');
    assert.ok(indexContent.includes('Badge'), 'Should have Badge export');
  });

  it('index.js exports Container component', () => {
    assert.ok(indexContent.includes("from './Container.svelte'"), 'Should export Container.svelte');
    assert.ok(indexContent.includes('Container'), 'Should have Container export');
  });

  it('index.js exports all four components', () => {
    const exports = ['Button', 'Card', 'Badge', 'Container'];
    for (const component of exports) {
    assert.ok(indexContent.includes(component), `Should export ${component}`);
    }
  });
});
