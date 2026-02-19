import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const HUB_DIR = path.join(PROJECT_ROOT, 'apps', 'hub');

describe('hub adapter node', () => {
  it('@sveltejs/adapter-node is installed in node_modules', () => {
    const adapterPath = path.join(PROJECT_ROOT, 'node_modules', '@sveltejs', 'adapter-node');
    assert(fs.existsSync(adapterPath), 'adapter-node not found in node_modules');
  });

  it('@sveltejs/adapter-node has package.json', () => {
    const pkgPath = path.join(PROJECT_ROOT, 'node_modules', '@sveltejs', 'adapter-node', 'package.json');
    assert(fs.existsSync(pkgPath), 'adapter-node package.json not found');
  });

  it('@sveltejs/adapter-node package has correct name', () => {
    const pkgPath = path.join(PROJECT_ROOT, 'node_modules', '@sveltejs', 'adapter-node', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    assert(pkg.name === '@sveltejs/adapter-node', `Expected name @sveltejs/adapter-node, got ${pkg.name}`);
  });

  it('@sveltejs/adapter-node is in hub devDependencies', () => {
    const hubPkgPath = path.join(HUB_DIR, 'package.json');
    const hubPkg = JSON.parse(fs.readFileSync(hubPkgPath, 'utf-8'));
    assert(hubPkg.devDependencies?.['@sveltejs/adapter-node'], 'adapter-node not in hub devDependencies');
  });

  it('svelte.config.js exists', () => {
    const configPath = path.join(HUB_DIR, 'svelte.config.js');
    assert(fs.existsSync(configPath), 'svelte.config.js not found');
  });

  it('svelte.config.js imports @sveltejs/adapter-node', () => {
    const configPath = path.join(HUB_DIR, 'svelte.config.js');
    const content = fs.readFileSync(configPath, 'utf-8');
    assert(content.includes("from '@sveltejs/adapter-node'"), 'svelte.config.js does not import adapter-node');
  });

  it('svelte.config.js does NOT import adapter-auto', () => {
    const configPath = path.join(HUB_DIR, 'svelte.config.js');
    const content = fs.readFileSync(configPath, 'utf-8');
    assert(!content.includes('@sveltejs/adapter-auto'), 'svelte.config.js still imports adapter-auto');
  });

  it('svelte.config.js calls adapter()', () => {
    const configPath = path.join(HUB_DIR, 'svelte.config.js');
    const content = fs.readFileSync(configPath, 'utf-8');
    assert(content.includes('adapter()') || content.includes('adapter('), 'svelte.config.js does not call adapter()');
  });

  it('svelte.config.js has kit.adapter configuration', () => {
    const configPath = path.join(HUB_DIR, 'svelte.config.js');
    const content = fs.readFileSync(configPath, 'utf-8');
    assert(content.includes('kit:') && content.includes('adapter:'), 'svelte.config.js missing kit.adapter');
  });

  it('svelte.config.js exports default config', () => {
    const configPath = path.join(HUB_DIR, 'svelte.config.js');
    const content = fs.readFileSync(configPath, 'utf-8');
    assert(content.includes('export default config'), 'svelte.config.js does not export default config');
  });

  it('svelte.config.js uses vitePreprocess', () => {
    const configPath = path.join(HUB_DIR, 'svelte.config.js');
    const content = fs.readFileSync(configPath, 'utf-8');
    assert(content.includes('vitePreprocess'), 'svelte.config.js does not use vitePreprocess');
  });

  it('@sveltejs/adapter-node is version 5.x or higher', () => {
    const pkgPath = path.join(PROJECT_ROOT, 'node_modules', '@sveltejs', 'adapter-node', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const majorVersion = parseInt(pkg.version.split('.')[0], 10);
    assert(majorVersion >= 5, `Expected adapter-node version 5.x or higher, got ${pkg.version}`);
  });
});
