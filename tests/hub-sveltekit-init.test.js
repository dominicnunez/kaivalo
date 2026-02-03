import { strict as assert } from 'assert';
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const projectRoot = '/home/kai/pets/kaivalo';
const hubRoot = join(projectRoot, 'apps/hub');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

console.log('\napps/hub SvelteKit initialization tests:');

// Directory structure tests
test('apps/hub directory exists', () => {
  assert.ok(existsSync(hubRoot), 'apps/hub directory should exist');
});

test('apps/hub is a directory', () => {
  const stats = statSync(hubRoot);
  assert.ok(stats.isDirectory(), 'apps/hub should be a directory');
});

test('apps/hub/src directory exists', () => {
  assert.ok(existsSync(join(hubRoot, 'src')), 'src directory should exist');
});

test('apps/hub/src/routes directory exists', () => {
  assert.ok(existsSync(join(hubRoot, 'src/routes')), 'src/routes directory should exist');
});

test('apps/hub/static directory exists', () => {
  assert.ok(existsSync(join(hubRoot, 'static')), 'static directory should exist');
});

// package.json tests
test('package.json exists', () => {
  assert.ok(existsSync(join(hubRoot, 'package.json')), 'package.json should exist');
});

test('package.json is valid JSON', () => {
  const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
  JSON.parse(content);
});

test('package.json has correct name', () => {
  const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
  const pkg = JSON.parse(content);
  assert.strictEqual(pkg.name, '@kaivalo/hub', 'package name should be @kaivalo/hub');
});

test('package.json is private', () => {
  const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
  const pkg = JSON.parse(content);
  assert.strictEqual(pkg.private, true, 'package should be private');
});

test('package.json has type: module', () => {
  const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
  const pkg = JSON.parse(content);
  assert.strictEqual(pkg.type, 'module', 'package should have type: module');
});

test('package.json has dev script', () => {
  const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
  const pkg = JSON.parse(content);
  assert.ok(pkg.scripts?.dev, 'should have dev script');
});

test('package.json has build script', () => {
  const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
  const pkg = JSON.parse(content);
  assert.ok(pkg.scripts?.build, 'should have build script');
});

test('package.json has preview script', () => {
  const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
  const pkg = JSON.parse(content);
  assert.ok(pkg.scripts?.preview, 'should have preview script');
});

test('package.json has @sveltejs/kit devDependency', () => {
  const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
  const pkg = JSON.parse(content);
  assert.ok(pkg.devDependencies?.['@sveltejs/kit'], 'should have @sveltejs/kit');
});

test('package.json has svelte devDependency', () => {
  const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
  const pkg = JSON.parse(content);
  assert.ok(pkg.devDependencies?.svelte, 'should have svelte');
});

test('package.json has vite devDependency', () => {
  const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
  const pkg = JSON.parse(content);
  assert.ok(pkg.devDependencies?.vite, 'should have vite');
});

test('package.json has typescript devDependency', () => {
  const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
  const pkg = JSON.parse(content);
  assert.ok(pkg.devDependencies?.typescript, 'should have typescript');
});

// SvelteKit config tests
test('svelte.config.js exists', () => {
  assert.ok(existsSync(join(hubRoot, 'svelte.config.js')), 'svelte.config.js should exist');
});

test('svelte.config.js imports adapter', () => {
  const content = readFileSync(join(hubRoot, 'svelte.config.js'), 'utf-8');
  assert.ok(content.includes('adapter'), 'should import adapter');
});

test('svelte.config.js has kit config', () => {
  const content = readFileSync(join(hubRoot, 'svelte.config.js'), 'utf-8');
  assert.ok(content.includes('kit:'), 'should have kit config');
});

test('svelte.config.js exports default config', () => {
  const content = readFileSync(join(hubRoot, 'svelte.config.js'), 'utf-8');
  assert.ok(content.includes('export default'), 'should export default config');
});

// Vite config tests
test('vite.config.ts exists', () => {
  assert.ok(existsSync(join(hubRoot, 'vite.config.ts')), 'vite.config.ts should exist');
});

test('vite.config.ts imports sveltekit', () => {
  const content = readFileSync(join(hubRoot, 'vite.config.ts'), 'utf-8');
  assert.ok(content.includes('sveltekit'), 'should import sveltekit');
});

test('vite.config.ts uses defineConfig', () => {
  const content = readFileSync(join(hubRoot, 'vite.config.ts'), 'utf-8');
  assert.ok(content.includes('defineConfig'), 'should use defineConfig');
});

// TypeScript config tests
test('tsconfig.json exists', () => {
  assert.ok(existsSync(join(hubRoot, 'tsconfig.json')), 'tsconfig.json should exist');
});

test('tsconfig.json extends .svelte-kit/tsconfig.json', () => {
  const content = readFileSync(join(hubRoot, 'tsconfig.json'), 'utf-8');
  const config = JSON.parse(content);
  assert.ok(config.extends?.includes('.svelte-kit/tsconfig.json'), 'should extend SvelteKit tsconfig');
});

test('tsconfig.json has strict mode', () => {
  const content = readFileSync(join(hubRoot, 'tsconfig.json'), 'utf-8');
  const config = JSON.parse(content);
  assert.strictEqual(config.compilerOptions?.strict, true, 'should have strict mode');
});

// App HTML tests
test('src/app.html exists', () => {
  assert.ok(existsSync(join(hubRoot, 'src/app.html')), 'app.html should exist');
});

test('app.html has %sveltekit.head%', () => {
  const content = readFileSync(join(hubRoot, 'src/app.html'), 'utf-8');
  assert.ok(content.includes('%sveltekit.head%'), 'should have sveltekit.head placeholder');
});

test('app.html has %sveltekit.body%', () => {
  const content = readFileSync(join(hubRoot, 'src/app.html'), 'utf-8');
  assert.ok(content.includes('%sveltekit.body%'), 'should have sveltekit.body placeholder');
});

test('app.html has viewport meta', () => {
  const content = readFileSync(join(hubRoot, 'src/app.html'), 'utf-8');
  assert.ok(content.includes('viewport'), 'should have viewport meta tag');
});

// App.d.ts tests
test('src/app.d.ts exists', () => {
  assert.ok(existsSync(join(hubRoot, 'src/app.d.ts')), 'app.d.ts should exist');
});

test('app.d.ts declares App namespace', () => {
  const content = readFileSync(join(hubRoot, 'src/app.d.ts'), 'utf-8');
  assert.ok(content.includes('namespace App'), 'should declare App namespace');
});

// Routes tests
test('src/routes/+page.svelte exists', () => {
  assert.ok(existsSync(join(hubRoot, 'src/routes/+page.svelte')), '+page.svelte should exist');
});

test('+page.svelte has content', () => {
  const content = readFileSync(join(hubRoot, 'src/routes/+page.svelte'), 'utf-8');
  assert.ok(content.includes('<h1'), 'should have heading element');
});

// Summary
console.log(`\n  ${passed} passing, ${failed} failing\n`);

if (failed > 0) {
  process.exit(1);
}
