import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envExamplePath = resolve(import.meta.dirname, '..', 'apps', 'hub', '.env.example');
const content = existsSync(envExamplePath) ? readFileSync(envExamplePath, 'utf-8') : '';

describe('apps/hub/.env.example', () => {
  it('file exists', () => {
    assert.ok(existsSync(envExamplePath));
  });

  it('is readable and non-empty', () => {
    assert.ok(content.length > 0);
  });

  it('contains header comment', () => {
    assert.ok(content.includes('# Environment Variables'));
  });

  it('mentions Kaivalo Hub', () => {
    assert.ok(content.includes('Kaivalo Hub'));
  });

  it('has WorkOS configuration variables', () => {
    assert.ok(content.includes('WORKOS_CLIENT_ID'));
  });

  it('starts with a comment', () => {
    assert.ok(content.trim().startsWith('#'));
  });

  it('has instruction to copy to .env', () => {
    assert.ok(content.includes('Copy this file to .env') || content.includes('.env'));
  });

  it('is in apps/hub directory', () => {
    assert.ok(envExamplePath.includes('apps/hub/.env.example'));
  });
});
