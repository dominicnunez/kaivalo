import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const uiPackageJsonPath = join(rootDir, 'packages', 'ui', 'package.json');
let packageJson;

describe('ui package json', () => {
  it('packages/ui/package.json exists', () => {
    assert.ok(existsSync(uiPackageJsonPath), 'packages/ui/package.json should exist');
  });

  it('packages/ui/package.json is valid JSON', () => {
    const content = readFileSync(uiPackageJsonPath, 'utf-8');
    packageJson = JSON.parse(content);
    assert.ok(packageJson, 'Should parse as valid JSON');
  });

  it('package name is @kaivalo/ui', () => {
    assert.strictEqual(packageJson.name, '@kaivalo/ui', 'Name should be @kaivalo/ui');
  });

  it('package type is module', () => {
    assert.strictEqual(packageJson.type, 'module', 'Type should be module');
  });

  it('package has version', () => {
    assert.ok(packageJson.version, 'Should have a version');
  });

  it('package has main entry point', () => {
    assert.ok(packageJson.main, 'Should have a main entry point');
    assert.strictEqual(packageJson.main, './index.js', 'Main should be ./index.js');
  });

  it('package has exports', () => {
    assert.ok(packageJson.exports, 'Should have exports field');
    assert.ok(packageJson.exports['.'], 'Should export main entry');
  });

  it('package has peerDependencies', () => {
    assert.ok(packageJson.peerDependencies, 'Should have peerDependencies');
  });

  it('svelte is a peer dependency', () => {
    assert.ok(packageJson.peerDependencies.svelte, 'Svelte should be a peer dependency');
    assert.ok(packageJson.peerDependencies.svelte.includes('^5'), 'Svelte peer dep should be ^5.x');
  });

  it('tailwindcss is a peer dependency', () => {
    assert.ok(packageJson.peerDependencies.tailwindcss, 'TailwindCSS should be a peer dependency');
  });
});
