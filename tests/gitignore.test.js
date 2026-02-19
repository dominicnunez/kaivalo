import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
let content;

describe('.gitignore configuration', () => {
  it('.gitignore exists', () => {
    const filePath = join(rootDir, '.gitignore');
    assert(existsSync(filePath), '.gitignore should exist in root directory');
    content = readFileSync(filePath, 'utf-8');
  });

  it('ignores node_modules', () => {
    assert(/^node_modules\/?$/m.test(content), 'should ignore node_modules');
  });

  it('ignores .env', () => {
    assert(/^\.env$/m.test(content), 'should ignore .env');
  });

  it('ignores build directory', () => {
    assert(/^build\/?$/m.test(content), 'should ignore build directory');
  });

  it('ignores .svelte-kit', () => {
    assert(/^\.svelte-kit\/?$/m.test(content), 'should ignore .svelte-kit');
  });

  it('has multiple entries', () => {
    const lines = content.split('\n').filter(line =>
    line.trim() && !line.startsWith('#')
    );
    assert(lines.length >= 4, `should have at least 4 entries, got ${lines.length}`);
  });
});
