import { describe, it } from 'node:test';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

describe('packages/ directory structure', () => {
  it('packages/ directory exists', () => {
    const packagesPath = join(rootDir, 'packages');
    assert(existsSync(packagesPath), 'packages/ directory should exist');
  });

  it('packages/ is a directory', () => {
    const packagesPath = join(rootDir, 'packages');
    const stats = statSync(packagesPath);
    assert(stats.isDirectory(), 'packages/ should be a directory, not a file');
  });

  it('packages/ has .gitkeep file', () => {
    const gitkeepPath = join(rootDir, 'packages', '.gitkeep');
    assert(existsSync(gitkeepPath), 'packages/.gitkeep should exist for git tracking');
  });

  it('packages/ is in monorepo root', () => {
    const packageJsonPath = join(rootDir, 'package.json');
    const packagesPath = join(rootDir, 'packages');
    assert(existsSync(packageJsonPath), 'package.json should exist in root');
    assert(existsSync(packagesPath), 'packages/ should be in same directory as package.json');
  });
});
