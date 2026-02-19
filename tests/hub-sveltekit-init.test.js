import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const hubRoot = join(projectRoot, 'apps/hub');
// Directory structure tests

describe('hub sveltekit init', () => {
  it('apps/hub directory exists', () => {
    assert.ok(existsSync(hubRoot), 'apps/hub directory should exist');
  });

  it('apps/hub is a directory', () => {
    const stats = statSync(hubRoot);
    assert.ok(stats.isDirectory(), 'apps/hub should be a directory');
  });

  it('apps/hub/src directory exists', () => {
    assert.ok(existsSync(join(hubRoot, 'src')), 'src directory should exist');
  });

  it('apps/hub/src/routes directory exists', () => {
    assert.ok(existsSync(join(hubRoot, 'src/routes')), 'src/routes directory should exist');
  });

  it('apps/hub/static directory exists', () => {
    assert.ok(existsSync(join(hubRoot, 'static')), 'static directory should exist');
  });

  it('package.json exists', () => {
    assert.ok(existsSync(join(hubRoot, 'package.json')), 'package.json should exist');
  });

  it('package.json is valid JSON', () => {
    const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
    JSON.parse(content);
  });

  it('package.json has correct name', () => {
    const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(content);
    assert.strictEqual(pkg.name, '@kaivalo/hub', 'package name should be @kaivalo/hub');
  });

  it('package.json is private', () => {
    const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(content);
    assert.strictEqual(pkg.private, true, 'package should be private');
  });

  it('package.json has type: module', () => {
    const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(content);
    assert.strictEqual(pkg.type, 'module', 'package should have type: module');
  });

  it('package.json has dev script', () => {
    const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(content);
    assert.ok(pkg.scripts?.dev, 'should have dev script');
  });

  it('package.json has build script', () => {
    const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(content);
    assert.ok(pkg.scripts?.build, 'should have build script');
  });

  it('package.json has preview script', () => {
    const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(content);
    assert.ok(pkg.scripts?.preview, 'should have preview script');
  });

  it('package.json has @sveltejs/kit devDependency', () => {
    const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(content);
    assert.ok(pkg.devDependencies?.['@sveltejs/kit'], 'should have @sveltejs/kit');
  });

  it('package.json has svelte devDependency', () => {
    const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(content);
    assert.ok(pkg.devDependencies?.svelte, 'should have svelte');
  });

  it('package.json has vite devDependency', () => {
    const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(content);
    assert.ok(pkg.devDependencies?.vite, 'should have vite');
  });

  it('package.json has typescript devDependency', () => {
    const content = readFileSync(join(hubRoot, 'package.json'), 'utf-8');
    const pkg = JSON.parse(content);
    assert.ok(pkg.devDependencies?.typescript, 'should have typescript');
  });

  it('svelte.config.js exists', () => {
    assert.ok(existsSync(join(hubRoot, 'svelte.config.js')), 'svelte.config.js should exist');
  });

  it('svelte.config.js imports adapter', () => {
    const content = readFileSync(join(hubRoot, 'svelte.config.js'), 'utf-8');
    assert.ok(content.includes('adapter'), 'should import adapter');
  });

  it('svelte.config.js has kit config', () => {
    const content = readFileSync(join(hubRoot, 'svelte.config.js'), 'utf-8');
    assert.ok(content.includes('kit:'), 'should have kit config');
  });

  it('svelte.config.js exports default config', () => {
    const content = readFileSync(join(hubRoot, 'svelte.config.js'), 'utf-8');
    assert.ok(content.includes('export default'), 'should export default config');
  });

  it('vite.config.ts exists', () => {
    assert.ok(existsSync(join(hubRoot, 'vite.config.ts')), 'vite.config.ts should exist');
  });

  it('vite.config.ts imports sveltekit', () => {
    const content = readFileSync(join(hubRoot, 'vite.config.ts'), 'utf-8');
    assert.ok(content.includes('sveltekit'), 'should import sveltekit');
  });

  it('vite.config.ts uses defineConfig', () => {
    const content = readFileSync(join(hubRoot, 'vite.config.ts'), 'utf-8');
    assert.ok(content.includes('defineConfig'), 'should use defineConfig');
  });

  it('tsconfig.json exists', () => {
    assert.ok(existsSync(join(hubRoot, 'tsconfig.json')), 'tsconfig.json should exist');
  });

  it('tsconfig.json extends .svelte-kit/tsconfig.json', () => {
    const content = readFileSync(join(hubRoot, 'tsconfig.json'), 'utf-8');
    const config = JSON.parse(content);
    assert.ok(config.extends?.includes('.svelte-kit/tsconfig.json'), 'should extend SvelteKit tsconfig');
  });

  it('tsconfig.json has strict mode', () => {
    const content = readFileSync(join(hubRoot, 'tsconfig.json'), 'utf-8');
    const config = JSON.parse(content);
    assert.strictEqual(config.compilerOptions?.strict, true, 'should have strict mode');
  });

  it('src/app.html exists', () => {
    assert.ok(existsSync(join(hubRoot, 'src/app.html')), 'app.html should exist');
  });

  it('app.html has %sveltekit.head%', () => {
    const content = readFileSync(join(hubRoot, 'src/app.html'), 'utf-8');
    assert.ok(content.includes('%sveltekit.head%'), 'should have sveltekit.head placeholder');
  });

  it('app.html has %sveltekit.body%', () => {
    const content = readFileSync(join(hubRoot, 'src/app.html'), 'utf-8');
    assert.ok(content.includes('%sveltekit.body%'), 'should have sveltekit.body placeholder');
  });

  it('app.html has viewport meta', () => {
    const content = readFileSync(join(hubRoot, 'src/app.html'), 'utf-8');
    assert.ok(content.includes('viewport'), 'should have viewport meta tag');
  });

  it('src/app.d.ts exists', () => {
    assert.ok(existsSync(join(hubRoot, 'src/app.d.ts')), 'app.d.ts should exist');
  });

  it('app.d.ts declares App namespace', () => {
    const content = readFileSync(join(hubRoot, 'src/app.d.ts'), 'utf-8');
    assert.ok(content.includes('namespace App'), 'should declare App namespace');
  });

  it('src/routes/+page.svelte exists', () => {
    assert.ok(existsSync(join(hubRoot, 'src/routes/+page.svelte')), '+page.svelte should exist');
  });

  it('+page.svelte has content', () => {
    const content = readFileSync(join(hubRoot, 'src/routes/+page.svelte'), 'utf-8');
    assert.ok(content.includes('<h1'), 'should have heading element');
  });
});
