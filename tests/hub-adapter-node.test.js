import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = '/home/kai/pets/kaivalo';
const HUB_DIR = path.join(PROJECT_ROOT, 'apps', 'hub');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('Testing hub adapter-node configuration...\n');

// Test 1: @sveltejs/adapter-node is installed
test('@sveltejs/adapter-node is installed in node_modules', () => {
  const adapterPath = path.join(PROJECT_ROOT, 'node_modules', '@sveltejs', 'adapter-node');
  assert(fs.existsSync(adapterPath), 'adapter-node not found in node_modules');
});

// Test 2: adapter-node has package.json
test('@sveltejs/adapter-node has package.json', () => {
  const pkgPath = path.join(PROJECT_ROOT, 'node_modules', '@sveltejs', 'adapter-node', 'package.json');
  assert(fs.existsSync(pkgPath), 'adapter-node package.json not found');
});

// Test 3: adapter-node package has correct name
test('@sveltejs/adapter-node package has correct name', () => {
  const pkgPath = path.join(PROJECT_ROOT, 'node_modules', '@sveltejs', 'adapter-node', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  assert(pkg.name === '@sveltejs/adapter-node', `Expected name @sveltejs/adapter-node, got ${pkg.name}`);
});

// Test 4: adapter-node is in hub devDependencies
test('@sveltejs/adapter-node is in hub devDependencies', () => {
  const hubPkgPath = path.join(HUB_DIR, 'package.json');
  const hubPkg = JSON.parse(fs.readFileSync(hubPkgPath, 'utf-8'));
  assert(hubPkg.devDependencies?.['@sveltejs/adapter-node'], 'adapter-node not in hub devDependencies');
});

// Test 5: svelte.config.js exists
test('svelte.config.js exists', () => {
  const configPath = path.join(HUB_DIR, 'svelte.config.js');
  assert(fs.existsSync(configPath), 'svelte.config.js not found');
});

// Test 6: svelte.config.js imports adapter-node
test('svelte.config.js imports @sveltejs/adapter-node', () => {
  const configPath = path.join(HUB_DIR, 'svelte.config.js');
  const content = fs.readFileSync(configPath, 'utf-8');
  assert(content.includes("from '@sveltejs/adapter-node'"), 'svelte.config.js does not import adapter-node');
});

// Test 7: svelte.config.js does NOT import adapter-auto
test('svelte.config.js does NOT import adapter-auto', () => {
  const configPath = path.join(HUB_DIR, 'svelte.config.js');
  const content = fs.readFileSync(configPath, 'utf-8');
  assert(!content.includes('@sveltejs/adapter-auto'), 'svelte.config.js still imports adapter-auto');
});

// Test 8: svelte.config.js uses adapter function call
test('svelte.config.js calls adapter()', () => {
  const configPath = path.join(HUB_DIR, 'svelte.config.js');
  const content = fs.readFileSync(configPath, 'utf-8');
  assert(content.includes('adapter()') || content.includes('adapter('), 'svelte.config.js does not call adapter()');
});

// Test 9: svelte.config.js has kit.adapter configuration
test('svelte.config.js has kit.adapter configuration', () => {
  const configPath = path.join(HUB_DIR, 'svelte.config.js');
  const content = fs.readFileSync(configPath, 'utf-8');
  assert(content.includes('kit:') && content.includes('adapter:'), 'svelte.config.js missing kit.adapter');
});

// Test 10: svelte.config.js exports default config
test('svelte.config.js exports default config', () => {
  const configPath = path.join(HUB_DIR, 'svelte.config.js');
  const content = fs.readFileSync(configPath, 'utf-8');
  assert(content.includes('export default config'), 'svelte.config.js does not export default config');
});

// Test 11: svelte.config.js uses vitePreprocess
test('svelte.config.js uses vitePreprocess', () => {
  const configPath = path.join(HUB_DIR, 'svelte.config.js');
  const content = fs.readFileSync(configPath, 'utf-8');
  assert(content.includes('vitePreprocess'), 'svelte.config.js does not use vitePreprocess');
});

// Test 12: adapter-node is correct version (should be ^5.x for SvelteKit 2)
test('@sveltejs/adapter-node is version 5.x or higher', () => {
  const pkgPath = path.join(PROJECT_ROOT, 'node_modules', '@sveltejs', 'adapter-node', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const majorVersion = parseInt(pkg.version.split('.')[0], 10);
  assert(majorVersion >= 5, `Expected adapter-node version 5.x or higher, got ${pkg.version}`);
});

console.log(`\n${passed} tests passed, ${failed} tests failed`);
process.exit(failed > 0 ? 1 : 0);
