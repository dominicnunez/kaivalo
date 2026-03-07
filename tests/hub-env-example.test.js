import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isIP } from 'node:net';

const envExamplePath = resolve(import.meta.dirname, '..', 'apps', 'hub', '.env.example');
const content = readFileSync(envExamplePath, 'utf-8');

function parseEnvTemplate(value) {
  const parsed = {};
  for (const line of value.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const envValue = trimmed.slice(separator + 1).trim();
    parsed[key] = envValue;
  }

  return parsed;
}

describe('apps/hub/.env.example behavior', () => {
  const envValues = parseEnvTemplate(content);
  const requiredWorkOsKeys = ['WORKOS_CLIENT_ID', 'WORKOS_API_KEY', 'WORKOS_REDIRECT_URI', 'WORKOS_COOKIE_PASSWORD'];

  it('declares all required WorkOS variables with non-empty template values', () => {
    for (const key of requiredWorkOsKeys) {
      assert.ok(envValues[key], `${key} should be present with a non-empty template value`);
    }
  });

  it('keeps redirect URI on the auth callback route', () => {
    const redirectUri = new URL(envValues.WORKOS_REDIRECT_URI);
    assert.strictEqual(redirectUri.pathname, '/auth/callback');
  });

  it('documents local development redirect URI for non-https workflows', () => {
    const redirectUri = new URL(envValues.WORKOS_REDIRECT_URI);
    assert.strictEqual(redirectUri.protocol, 'http:');
    assert.strictEqual(redirectUri.hostname, 'localhost');
  });

  it('uses a cookie password placeholder that reflects the 64-char requirement', () => {
    assert.ok(
      /64/i.test(envValues.WORKOS_COOKIE_PASSWORD),
      'template value should signal the 64-character cookie secret requirement'
    );
  });

  it('declares ORIGIN with a local dev default value aligned to redirect origin', () => {
    assert.strictEqual(envValues.ORIGIN, 'http://localhost:5173');
    const redirectUri = new URL(envValues.WORKOS_REDIRECT_URI);
    assert.strictEqual(`${redirectUri.protocol}//${redirectUri.host}`, envValues.ORIGIN);
  });

  it('includes a parseable production redirect/origin example pair', () => {
    const commentedPairs = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('# WORKOS_REDIRECT_URI=') || line.startsWith('# ORIGIN='))
      .map((line) => line.slice(2));

    const parsedPairs = parseEnvTemplate(commentedPairs.join('\n'));
    const redirectUri = new URL(parsedPairs.WORKOS_REDIRECT_URI);
    assert.strictEqual(redirectUri.pathname, '/auth/callback');
    assert.strictEqual(parsedPairs.ORIGIN, `${redirectUri.protocol}//${redirectUri.host}`);
  });

  it('declares trusted proxy defaults that are safe without proxy forwarding', () => {
    assert.strictEqual(envValues.TRUST_X_FORWARDED_PROTO, 'false');
    const trustedIps = (envValues.TRUSTED_PROXY_IPS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    assert.ok(trustedIps.length > 0, 'TRUSTED_PROXY_IPS should include at least one template value');
    for (const ip of trustedIps) {
      assert.ok(isIP(ip), `trusted proxy ip template entry must be a valid IP: ${ip}`);
    }
  });

  it('documents proxy forwarding as mandatory for production https origins', () => {
    assert.match(content, /mandatory for production https origins/i);
    assert.doesNotMatch(content, /directly serves https itself/i);
  });

  it('documents a positive graceful-shutdown timeout', () => {
    const shutdownTimeoutMs = Number.parseInt(envValues.SHUTDOWN_TIMEOUT_MS ?? '', 10);
    assert.ok(Number.isInteger(shutdownTimeoutMs) && shutdownTimeoutMs > 0);
  });
});
