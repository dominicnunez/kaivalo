import { describe, it } from 'node:test';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

describe('apps/ directory structure', () => {
  it('apps/ directory exists', () => {
    const appsPath = join(rootDir, 'apps');
    assert(existsSync(appsPath), 'apps/ directory should exist');
  });

  it('apps/ is a directory', () => {
    const appsPath = join(rootDir, 'apps');
    const stats = statSync(appsPath);
    assert(stats.isDirectory(), 'apps/ should be a directory, not a file');
  });

  it('apps/ has .gitkeep file', () => {
    const gitkeepPath = join(rootDir, 'apps', '.gitkeep');
    assert(existsSync(gitkeepPath), 'apps/.gitkeep should exist for git tracking');
  });

  it('apps/ is in monorepo root', () => {
    const packageJsonPath = join(rootDir, 'package.json');
    const appsPath = join(rootDir, 'apps');
    assert(existsSync(packageJsonPath), 'package.json should exist in root');
    assert(existsSync(appsPath), 'apps/ should be in same directory as package.json');
  });
});
