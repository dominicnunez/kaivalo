import { describe, it } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
let pkg;

describe('root package.json workspace configuration', () => {
  it('package.json exists', () => {
    const packagePath = join(rootDir, 'package.json');
    assert(existsSync(packagePath), 'package.json should exist in root directory');
  });

  it('package.json is valid JSON', () => {
    const packagePath = join(rootDir, 'package.json');
    const content = readFileSync(packagePath, 'utf-8');
    pkg = JSON.parse(content);
    assert(typeof pkg === 'object', 'package.json should parse to an object');
  });

  it('has name field', () => {
    assert(pkg.name === 'kaivalo', `name should be "kaivalo", got "${pkg.name}"`);
  });

  it('is marked as private', () => {
    assert(pkg.private === true, 'private should be true for monorepo root');
  });

  it('has workspaces configuration', () => {
    assert(Array.isArray(pkg.workspaces), 'workspaces should be an array');
  });

  it('workspaces includes apps/*', () => {
    assert(pkg.workspaces.includes('apps/*'), 'workspaces should include "apps/*"');
  });

  it('workspaces includes packages/*', () => {
    assert(pkg.workspaces.includes('packages/*'), 'workspaces should include "packages/*"');
  });

  it('has version field', () => {
    assert(typeof pkg.version === 'string', 'version should be a string');
  });
});
