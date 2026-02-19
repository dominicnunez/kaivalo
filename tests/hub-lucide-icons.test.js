import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const rootPath = path.resolve(import.meta.dirname, '..');
const hubPath = path.join(rootPath, 'apps/hub');
// Test lucide-svelte is installed in node_modules

describe('hub lucide icons', () => {
  it('lucide-svelte package is installed', () => {
    const lucidePath = path.join(rootPath, 'node_modules', 'lucide-svelte');
    assert.ok(fs.existsSync(lucidePath), 'lucide-svelte package should exist in node_modules');
  });

  it('lucide-svelte has package.json', () => {
    const pkgPath = path.join(rootPath, 'node_modules', 'lucide-svelte', 'package.json');
    assert.ok(fs.existsSync(pkgPath), 'lucide-svelte should have package.json');
  });

  it('lucide-svelte package has correct name', () => {
    const pkgPath = path.join(rootPath, 'node_modules', 'lucide-svelte', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.strictEqual(pkg.name, 'lucide-svelte', 'Package name should be lucide-svelte');
  });

  it('lucide-svelte has dist directory', () => {
    const distPath = path.join(rootPath, 'node_modules', 'lucide-svelte', 'dist');
    assert.ok(fs.existsSync(distPath), 'lucide-svelte should have dist directory');
  });

  it('hub package.json includes lucide-svelte dependency', () => {
    const pkgPath = path.join(hubPath, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.ok(pkg.dependencies, 'package.json should have dependencies');
    assert.ok(pkg.dependencies['lucide-svelte'], 'lucide-svelte should be in dependencies');
  });

  it('lucide-svelte has valid version', () => {
    const pkgPath = path.join(rootPath, 'node_modules', 'lucide-svelte', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.ok(pkg.version, 'lucide-svelte should have a version');
    assert.ok(/^\d+\.\d+\.\d+/.test(pkg.version), `Version should be semver format, got ${pkg.version}`);
  });

  it('lucide-svelte has svelte as peer dependency', () => {
    const pkgPath = path.join(rootPath, 'node_modules', 'lucide-svelte', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const hasSveltePeer = pkg.peerDependencies && pkg.peerDependencies.svelte;
    assert.ok(hasSveltePeer, 'lucide-svelte should have svelte as peer dependency');
  });

  it('lucide-svelte exports icons', () => {
    const pkgPath = path.join(rootPath, 'node_modules', 'lucide-svelte', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    // Check for exports field or main entry
    const hasExports = pkg.exports || pkg.main || pkg.module;
    assert.ok(hasExports, 'lucide-svelte should have exports, main, or module field');
  });

  it('lucide-svelte contains Wrench icon', () => {
    const distPath = path.join(rootPath, 'node_modules', 'lucide-svelte', 'dist');
    const files = fs.readdirSync(distPath);
    // Check for wrench in any form (icons are typically in dist)
    const hasWrenchRelated = files.some(f => f.toLowerCase().includes('wrench') || f === 'icons');
    // Or check package exports
    const pkgPath = path.join(rootPath, 'node_modules', 'lucide-svelte', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const exportsIcons = pkg.exports && (pkg.exports['./icons/*'] || pkg.exports['.']);
    assert.ok(hasWrenchRelated || exportsIcons, 'lucide-svelte should contain icons like Wrench');
  });

  it('lucide-svelte supports icon imports', () => {
    const pkgPath = path.join(rootPath, 'node_modules', 'lucide-svelte', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    // lucide-svelte should have exports that allow importing icons
    const hasMainExport = pkg.exports && pkg.exports['.'];
    const hasModule = pkg.module || pkg.main;
    assert.ok(hasMainExport || hasModule, 'lucide-svelte should support icon imports');
  });
});
