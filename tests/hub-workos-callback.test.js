import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const hubSrc = resolve(import.meta.dirname, '..', 'apps', 'hub', 'src');
const callbackPath = resolve(hubSrc, 'routes', 'auth', 'callback', '+server.ts');

describe('WorkOS Auth Callback Route', () => {
  describe('file structure', () => {
    it('callback route file exists at src/routes/auth/callback/+server.ts', () => {
      assert.ok(existsSync(callbackPath), '+server.ts should exist in auth/callback route');
    });

    it('route path matches WORKOS_REDIRECT_URI in .env.example', () => {
      const envExample = readFileSync(
        resolve(import.meta.dirname, '..', 'apps', 'hub', '.env.example'),
        'utf8'
      );
      const match = envExample.match(/WORKOS_REDIRECT_URI=.*\/(auth\/callback)/);
      assert.ok(match, 'WORKOS_REDIRECT_URI should end with /auth/callback');
      assert.strictEqual(match[1], 'auth/callback');
    });
  });

  describe('imports', () => {
    it('imports authKit from @workos/authkit-sveltekit', () => {
      const content = readFileSync(callbackPath, 'utf8');
      assert.ok(
        content.includes('authKit') && content.includes('@workos/authkit-sveltekit'),
        'should import authKit from @workos/authkit-sveltekit'
      );
    });

    it('imports RequestHandler type from ./$types', () => {
      const content = readFileSync(callbackPath, 'utf8');
      assert.ok(
        content.includes('RequestHandler') && content.includes('./$types'),
        'should import RequestHandler type from ./$types'
      );
    });
  });

  describe('GET handler', () => {
    it('exports a GET handler', () => {
      const content = readFileSync(callbackPath, 'utf8');
      assert.ok(
        content.includes('export const GET'),
        'should export a GET request handler'
      );
    });

    it('GET handler is typed as RequestHandler', () => {
      const content = readFileSync(callbackPath, 'utf8');
      assert.ok(
        content.includes('GET: RequestHandler'),
        'GET should be typed as RequestHandler'
      );
    });

    it('GET handler is async', () => {
      const content = readFileSync(callbackPath, 'utf8');
      assert.ok(
        content.includes('async'),
        'GET handler should be async'
      );
    });

    it('uses authKit.handleCallback()', () => {
      const content = readFileSync(callbackPath, 'utf8');
      assert.ok(
        content.includes('authKit.handleCallback()'),
        'should call authKit.handleCallback() to create the handler'
      );
    });

    it('passes event to the handler', () => {
      const content = readFileSync(callbackPath, 'utf8');
      assert.ok(
        content.includes('event'),
        'should pass event to the callback handler'
      );
    });
  });

  describe('security', () => {
    it('does not hardcode any credentials or secrets', () => {
      const content = readFileSync(callbackPath, 'utf8');
      assert.ok(!content.includes('client_01'), 'should not contain client IDs');
      assert.ok(!content.includes('sk_test_'), 'should not contain API keys');
      assert.ok(!content.includes('sk_live_'), 'should not contain live API keys');
      assert.ok(!content.includes('password'), 'should not contain passwords');
    });

    it('does not import environment variables directly', () => {
      const content = readFileSync(callbackPath, 'utf8');
      assert.ok(
        !content.includes('$env'),
        'callback route should not need env vars — authKit uses config from hooks'
      );
    });
  });
});
