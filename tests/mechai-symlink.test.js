import { describe, it } from 'node:test';
import { existsSync, lstatSync, readlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const mechaiPath = join(rootDir, 'apps', 'mechai');
const targetExists = existsSync(mechaiPath);

describe('mechai symlink (apps/mechai -> mechanic-ai)', () => {
  it('apps/mechai symlink entry exists', () => {
    const stats = lstatSync(mechaiPath);
    assert(stats, 'apps/mechai should exist as a filesystem entry');
  });

  it('apps/mechai is a symlink', () => {
    const stats = lstatSync(mechaiPath);
    assert(stats.isSymbolicLink(), 'apps/mechai should be a symlink');
  });

  it('symlink target is a valid path', { skip: !targetExists && 'mechanic-ai directory not present' }, () => {
    const target = readlinkSync(mechaiPath);
    assert.ok(existsSync(target), `symlink target ${target} should exist`);
  });

  it('symlink target is accessible', { skip: !targetExists && 'mechanic-ai directory not present' }, () => {
    assert(existsSync(mechaiPath), 'symlink target should be accessible');
  });

  it('symlink target contains package.json (mechanic-ai)', { skip: !targetExists && 'mechanic-ai directory not present' }, () => {
    const packageJsonPath = join(mechaiPath, 'package.json');
    assert(existsSync(packageJsonPath), 'mechanic-ai should have a package.json');
  });

  it('symlink target contains svelte.config.js', { skip: !targetExists && 'mechanic-ai directory not present' }, () => {
    const svelteConfigPath = join(mechaiPath, 'svelte.config.js');
    assert(existsSync(svelteConfigPath), 'mechanic-ai should have svelte.config.js');
  });
});
