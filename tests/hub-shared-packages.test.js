import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, lstatSync, readlinkSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const nodeModulesKaivalo = join(projectRoot, 'node_modules', '@kaivalo');
const hubPackageJson = join(projectRoot, 'apps', 'hub', 'package.json');
// Test @kaivalo scope directory exists

describe('hub shared packages', () => {
  it('@kaivalo scope directory exists in node_modules', () => {
    assert.ok(existsSync(nodeModulesKaivalo), '@kaivalo directory should exist');
  });

  it('@kaivalo/ui package is symlinked', () => {
    const uiPath = join(nodeModulesKaivalo, 'ui');
    assert.ok(existsSync(uiPath), '@kaivalo/ui should exist');
  });

  it('@kaivalo/ui is a symbolic link', () => {
    const uiPath = join(nodeModulesKaivalo, 'ui');
    const stats = lstatSync(uiPath);
    assert.ok(stats.isSymbolicLink(), '@kaivalo/ui should be a symlink');
  });

  it('@kaivalo/ui symlink points to packages/ui', () => {
    const uiPath = join(nodeModulesKaivalo, 'ui');
    const target = readlinkSync(uiPath);
    assert.ok(target.includes('packages/ui'), `Expected symlink to point to packages/ui, got ${target}`);
  });

  it('@kaivalo/ui has package.json with correct name', () => {
    const uiPath = join(nodeModulesKaivalo, 'ui');
    const pkgPath = join(uiPath, 'package.json');
    assert.ok(existsSync(pkgPath), 'package.json should exist in @kaivalo/ui');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.strictEqual(pkg.name, '@kaivalo/ui', 'package name should be @kaivalo/ui');
  });

  it('@kaivalo/ui has index.js', () => {
    const uiPath = join(nodeModulesKaivalo, 'ui');
    const indexPath = join(uiPath, 'index.js');
    assert.ok(existsSync(indexPath), 'index.js should exist in @kaivalo/ui');
  });

  it('@kaivalo/ui has Button.svelte component', () => {
    const uiPath = join(nodeModulesKaivalo, 'ui');
    const componentPath = join(uiPath, 'Button.svelte');
    assert.ok(existsSync(componentPath), 'Button.svelte should exist');
  });

  it('@kaivalo/ui has Card.svelte component', () => {
    const uiPath = join(nodeModulesKaivalo, 'ui');
    const componentPath = join(uiPath, 'Card.svelte');
    assert.ok(existsSync(componentPath), 'Card.svelte should exist');
  });

  it('@kaivalo/ui has Badge.svelte component', () => {
    const uiPath = join(nodeModulesKaivalo, 'ui');
    const componentPath = join(uiPath, 'Badge.svelte');
    assert.ok(existsSync(componentPath), 'Badge.svelte should exist');
  });

  it('@kaivalo/ui has Container.svelte component', () => {
    const uiPath = join(nodeModulesKaivalo, 'ui');
    const componentPath = join(uiPath, 'Container.svelte');
    assert.ok(existsSync(componentPath), 'Container.svelte should exist');
  });

  it('apps/hub/package.json exists', () => {
    assert.ok(existsSync(hubPackageJson), 'hub package.json should exist');
  });

  it('apps/hub/package.json has @kaivalo/ui dependency', () => {
    const pkg = JSON.parse(readFileSync(hubPackageJson, 'utf8'));
    assert.ok(pkg.dependencies, 'dependencies should exist');
    assert.ok('@kaivalo/ui' in pkg.dependencies, '@kaivalo/ui should be in dependencies');
  });

  it('@kaivalo/ui dependency uses workspace version (*)', () => {
    const pkg = JSON.parse(readFileSync(hubPackageJson, 'utf8'));
    assert.strictEqual(pkg.dependencies['@kaivalo/ui'], '*', '@kaivalo/ui should use * (workspace link)');
  });
});
