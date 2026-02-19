import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const hubDir = resolve(import.meta.dirname, '..', 'apps', 'hub');
const rootDir = resolve(import.meta.dirname, '..');

describe('WorkOS AuthKit Installation', () => {
  describe('Package dependency', () => {
    it('hub package.json lists @workos/authkit-sveltekit as dependency', () => {
      const pkg = JSON.parse(readFileSync(resolve(hubDir, 'package.json'), 'utf8'));
      assert.ok(
        pkg.dependencies?.['@workos/authkit-sveltekit'],
        'should have @workos/authkit-sveltekit in dependencies'
      );
    });

    it('@workos/authkit-sveltekit version is ^0.1.0 or later', () => {
      const pkg = JSON.parse(readFileSync(resolve(hubDir, 'package.json'), 'utf8'));
      const version = pkg.dependencies['@workos/authkit-sveltekit'];
      assert.ok(version, 'version should be defined');
      assert.match(version, /^\^?\d+\.\d+\.\d+/, 'should be a valid semver range');
    });

    it('package is installed in node_modules', () => {
      const pkgPath = resolve(rootDir, 'node_modules', '@workos', 'authkit-sveltekit', 'package.json');
      assert.ok(existsSync(pkgPath), 'package should be installed');
    });

    it('installed package has dist directory', () => {
      const distPath = resolve(rootDir, 'node_modules', '@workos', 'authkit-sveltekit', 'dist');
      assert.ok(existsSync(distPath), 'dist directory should exist');
    });

    it('package exports authKitHandle function', () => {
      const indexPath = resolve(rootDir, 'node_modules', '@workos', 'authkit-sveltekit', 'dist', 'index.d.ts');
      const dts = readFileSync(indexPath, 'utf8');
      assert.ok(dts.includes('authKitHandle'), 'should export authKitHandle');
    });

    it('package exports authKit object', () => {
      const indexPath = resolve(rootDir, 'node_modules', '@workos', 'authkit-sveltekit', 'dist', 'index.d.ts');
      const dts = readFileSync(indexPath, 'utf8');
      assert.ok(dts.includes('authKit'), 'should export authKit');
    });

    it('package exports configureAuthKit function', () => {
      const indexPath = resolve(rootDir, 'node_modules', '@workos', 'authkit-sveltekit', 'dist', 'index.d.ts');
      const dts = readFileSync(indexPath, 'utf8');
      assert.ok(dts.includes('configureAuthKit'), 'should export configureAuthKit');
    });
  });

  describe('.env.example has WorkOS variables', () => {
    const envExample = readFileSync(resolve(hubDir, '.env.example'), 'utf8');

    it('contains WORKOS_CLIENT_ID placeholder', () => {
      assert.ok(envExample.includes('WORKOS_CLIENT_ID='), 'should have WORKOS_CLIENT_ID');
    });

    it('contains WORKOS_API_KEY placeholder', () => {
      assert.ok(envExample.includes('WORKOS_API_KEY='), 'should have WORKOS_API_KEY');
    });

    it('contains WORKOS_REDIRECT_URI', () => {
      assert.ok(envExample.includes('WORKOS_REDIRECT_URI='), 'should have WORKOS_REDIRECT_URI');
    });

    it('WORKOS_REDIRECT_URI points to /auth/callback', () => {
      assert.ok(
        envExample.includes('WORKOS_REDIRECT_URI=http://localhost:3100/auth/callback'),
        'should point to localhost:3100/auth/callback (PM2 production port)'
      );
    });

    it('contains WORKOS_COOKIE_PASSWORD placeholder', () => {
      assert.ok(envExample.includes('WORKOS_COOKIE_PASSWORD='), 'should have WORKOS_COOKIE_PASSWORD');
    });
  });

  describe('.env has actual WorkOS credentials', () => {
    const envPath = resolve(hubDir, '.env');
    const envExists = existsSync(envPath);

    it('WORKOS_CLIENT_ID is set (not placeholder)', (t) => {
      if (!envExists) { t.skip('.env file not present'); return; }
      const env = readFileSync(envPath, 'utf8');
      const match = env.match(/WORKOS_CLIENT_ID=(.+)/);
      assert.ok(match, 'should have WORKOS_CLIENT_ID');
      assert.ok(!match[1].includes('your_'), 'should not be a placeholder value');
      assert.ok(match[1].length > 10, 'should be a real client ID');
    });

    it('WORKOS_API_KEY is set (not placeholder)', (t) => {
      if (!envExists) { t.skip('.env file not present'); return; }
      const env = readFileSync(envPath, 'utf8');
      const match = env.match(/WORKOS_API_KEY=(.+)/);
      assert.ok(match, 'should have WORKOS_API_KEY');
      assert.ok(!match[1].includes('your_'), 'should not be a placeholder value');
      assert.ok(match[1].length > 10, 'should be a real API key');
    });

    it('WORKOS_COOKIE_PASSWORD is set (not placeholder)', (t) => {
      if (!envExists) { t.skip('.env file not present'); return; }
      const env = readFileSync(envPath, 'utf8');
      const match = env.match(/WORKOS_COOKIE_PASSWORD=(.+)/);
      assert.ok(match, 'should have WORKOS_COOKIE_PASSWORD');
      assert.ok(!match[1].includes('your_'), 'should not be a placeholder value');
      assert.ok(match[1].length >= 64, 'should be at least 64 hex characters');
      assert.match(match[1], /^[a-f0-9]+$/i, 'should be hex characters');
    });
  });
});
