import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const hubSrc = resolve(import.meta.dirname, '..', 'apps', 'hub', 'src');

describe('WorkOS AuthKit Hooks Configuration', () => {
  describe('hooks.server.ts', () => {
    const hooksPath = resolve(hubSrc, 'hooks.server.ts');

    it('file exists', () => {
      assert.ok(existsSync(hooksPath), 'hooks.server.ts should exist');
    });

    it('imports configureAuthKit from @workos/authkit-sveltekit', () => {
      const content = readFileSync(hooksPath, 'utf8');
      assert.ok(
        content.includes("configureAuthKit") && content.includes("@workos/authkit-sveltekit"),
        'should import configureAuthKit from @workos/authkit-sveltekit'
      );
    });

    it('imports authKitHandle from @workos/authkit-sveltekit', () => {
      const content = readFileSync(hooksPath, 'utf8');
      assert.ok(
        content.includes("authKitHandle") && content.includes("@workos/authkit-sveltekit"),
        'should import authKitHandle from @workos/authkit-sveltekit'
      );
    });

    it('imports env from $env/dynamic/private', () => {
      const content = readFileSync(hooksPath, 'utf8');
      assert.ok(
        content.includes("$env/dynamic/private"),
        'should import from $env/dynamic/private for runtime env access'
      );
    });

    it('calls configureAuthKit with clientId', () => {
      const content = readFileSync(hooksPath, 'utf8');
      assert.ok(
        content.includes('clientId') && content.includes('WORKOS_CLIENT_ID'),
        'should pass WORKOS_CLIENT_ID as clientId'
      );
    });

    it('calls configureAuthKit with apiKey', () => {
      const content = readFileSync(hooksPath, 'utf8');
      assert.ok(
        content.includes('apiKey') && content.includes('WORKOS_API_KEY'),
        'should pass WORKOS_API_KEY as apiKey'
      );
    });

    it('calls configureAuthKit with redirectUri', () => {
      const content = readFileSync(hooksPath, 'utf8');
      assert.ok(
        content.includes('redirectUri') && content.includes('WORKOS_REDIRECT_URI'),
        'should pass WORKOS_REDIRECT_URI as redirectUri'
      );
    });

    it('calls configureAuthKit with cookiePassword', () => {
      const content = readFileSync(hooksPath, 'utf8');
      assert.ok(
        content.includes('cookiePassword') && content.includes('WORKOS_COOKIE_PASSWORD'),
        'should pass WORKOS_COOKIE_PASSWORD as cookiePassword'
      );
    });

    it('exports handle using authKitHandle()', () => {
      const content = readFileSync(hooksPath, 'utf8');
      assert.ok(
        content.includes('export const handle') && content.includes('authKitHandle()'),
        'should export handle = authKitHandle()'
      );
    });

    it('does not hardcode any credentials', () => {
      const content = readFileSync(hooksPath, 'utf8');
      assert.ok(!content.includes('client_01'), 'should not hardcode client ID');
      assert.ok(!content.includes('sk_test_'), 'should not hardcode test API key');
      assert.ok(!content.includes('sk_live_'), 'should not hardcode production API key');
      assert.ok(!(/\b[a-f0-9]{32,}\b/.test(content)), 'should not hardcode long hex secrets (cookie password, keys)');
    });

    it('uses env. prefix for all WorkOS vars (dynamic access)', () => {
      const content = readFileSync(hooksPath, 'utf8');
      assert.ok(content.includes('env.WORKOS_CLIENT_ID'), 'should use env.WORKOS_CLIENT_ID');
      assert.ok(content.includes('env.WORKOS_API_KEY'), 'should use env.WORKOS_API_KEY');
      assert.ok(content.includes('env.WORKOS_REDIRECT_URI'), 'should use env.WORKOS_REDIRECT_URI');
      assert.ok(content.includes('env.WORKOS_COOKIE_PASSWORD'), 'should use env.WORKOS_COOKIE_PASSWORD');
    });
  });

  describe('app.d.ts type augmentation', () => {
    const appDtsPath = resolve(hubSrc, 'app.d.ts');

    it('file exists', () => {
      assert.ok(existsSync(appDtsPath), 'app.d.ts should exist');
    });

    it('declares App namespace', () => {
      const content = readFileSync(appDtsPath, 'utf8');
      assert.ok(content.includes('namespace App'), 'should declare App namespace');
    });

    it('defines Locals interface with auth property', () => {
      const content = readFileSync(appDtsPath, 'utf8');
      assert.ok(
        content.includes('interface Locals'),
        'should define Locals interface'
      );
      assert.ok(
        content.includes('auth'),
        'Locals should have auth property'
      );
    });

    it('auth type references AuthKitAuth from @workos/authkit-sveltekit', () => {
      const content = readFileSync(appDtsPath, 'utf8');
      assert.ok(
        content.includes('@workos/authkit-sveltekit') && content.includes('AuthKitAuth'),
        'auth should be typed as AuthKitAuth from @workos/authkit-sveltekit'
      );
    });

    it('exports empty object for module augmentation', () => {
      const content = readFileSync(appDtsPath, 'utf8');
      assert.ok(
        content.includes('export {}'),
        'should export {} for module augmentation to work'
      );
    });
  });
});
