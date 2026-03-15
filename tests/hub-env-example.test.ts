import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	getProxyTrustConfiguration,
	getValidatedWorkosEnv
} from '../apps/hub/src/lib/server/workos-security.ts';

const envExamplePath = resolve(
	import.meta.dirname,
	'..',
	'apps',
	'hub',
	'.env.example'
);
const runtimeEnvDocPath = resolve(
	import.meta.dirname,
	'..',
	'docs',
	'runtime-env.md'
);
const content = readFileSync(envExamplePath, 'utf-8');
const runtimeEnvDoc = readFileSync(runtimeEnvDocPath, 'utf-8');

const runtimeEnvExampleMatch = runtimeEnvDoc.match(/```env\n([\s\S]*?)\n```/);

if (!runtimeEnvExampleMatch) {
	throw new Error('docs/runtime-env.md must include an env example block');
}

const runtimeEnvExample = parseEnvTemplate(runtimeEnvExampleMatch[1]);
const commentedEnvValues = parseCommentedEnvTemplate(content);

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

function parseCommentedEnvTemplate(value) {
	return parseEnvTemplate(
		value
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => /^#\s*[A-Z0-9_]+=/.test(line))
			.map((line) => line.replace(/^#\s*/, ''))
			.join('\n')
	);
}

function assertEnvValues(actual, expected) {
	for (const [key, value] of Object.entries(expected)) {
		assert.strictEqual(actual[key], value);
	}
}

describe('apps/hub/.env.example behavior', () => {
	const envValues = parseEnvTemplate(content);
	const fixtureSecrets = {
		WORKOS_CLIENT_ID: 'client_fixture',
		WORKOS_API_KEY: 'sk_fixture',
		WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
		AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
		AVATAR_PROXY_SIGNING_SECRET: 'ef'.repeat(32)
	};

	it('documents a local development configuration that validates with real secrets', () => {
		const validated = getValidatedWorkosEnv({
			...envValues,
			...fixtureSecrets,
			NODE_ENV: 'development'
		});

		assert.strictEqual(
			validated.redirectUri,
			'http://localhost:5173/auth/callback'
		);
		assert.strictEqual(validated.origin, 'http://localhost:5173');
		assert.strictEqual(
			validated.cookiePassword,
			fixtureSecrets.WORKOS_COOKIE_PASSWORD
		);
	});

	it('documents local development defaults with machine-checkable example values', () => {
		assertEnvValues(envValues, {
			WORKOS_REDIRECT_URI: 'http://localhost:5173/auth/callback',
			ORIGIN: 'http://localhost:5173',
			TRUST_X_FORWARDED_PROTO: 'false',
			HOST: '127.0.0.1',
			PORT: '3100',
			SHUTDOWN_TIMEOUT_MS: '30000'
		});
	});

	it('keeps local development proxy trust disabled by default', () => {
		const validated = getValidatedWorkosEnv({
			...envValues,
			...fixtureSecrets,
			NODE_ENV: 'development'
		});

		const proxyConfig = getProxyTrustConfiguration(
			{
				...envValues,
				NODE_ENV: 'development'
			},
			validated.origin
		);

		assert.deepStrictEqual(proxyConfig, {
			trustForwardedProto: false,
			trustedProxyIps: []
		});
	});

	it('documents a production example that validates with real secrets', () => {
		const validated = getValidatedWorkosEnv({
			...commentedEnvValues,
			...fixtureSecrets,
			NODE_ENV: 'production'
		});

		assert.strictEqual(
			validated.redirectUri,
			'https://hub.kaivalo.com/auth/callback'
		);
		assert.strictEqual(validated.origin, 'https://hub.kaivalo.com');
	});

	it('keeps production examples aligned with runtime validation contracts', () => {
		const proxyConfig = getProxyTrustConfiguration(
			{
				...runtimeEnvExample,
				NODE_ENV: 'production'
			},
			runtimeEnvExample.ORIGIN
		);

		assert.deepStrictEqual(proxyConfig, {
			trustForwardedProto: true,
			trustedProxyIps: ['203.0.113.10', '2001:db8::10']
		});
		assert.throws(
			() =>
				getProxyTrustConfiguration(
					{
						...runtimeEnvExample,
						NODE_ENV: 'production',
						TRUSTED_PROXY_IPS: ' '
					},
					runtimeEnvExample.ORIGIN
				),
			/TRUSTED_PROXY_IPS must be configured when TRUST_X_FORWARDED_PROTO=true/
		);

		assertEnvValues(commentedEnvValues, {
			WORKOS_REDIRECT_URI: 'https://hub.kaivalo.com/auth/callback',
			ORIGIN: 'https://hub.kaivalo.com',
			WORKOS_API_HOSTNAME: 'auth.kaivalo.com',
			TRUSTED_PROXY_IPS: '203.0.113.10,2001:db8::10',
			ADDRESS_HEADER: 'x-forwarded-for',
			XFF_DEPTH: '1'
		});
		assertEnvValues(runtimeEnvExample, {
			PORT: '3100',
			HOST: '0.0.0.0',
			ORIGIN: 'https://hub.kaivalo.com',
			WORKOS_REDIRECT_URI: 'https://hub.kaivalo.com/auth/callback',
			WORKOS_CLIENT_ID: 'client_...',
			WORKOS_API_KEY: 'sk_...',
			TRUST_X_FORWARDED_PROTO: 'true',
			TRUSTED_PROXY_IPS: '203.0.113.10,2001:db8::10',
			ADDRESS_HEADER: 'x-forwarded-for',
			XFF_DEPTH: '1',
			SHUTDOWN_TIMEOUT_MS: '30000'
		});
		assert.strictEqual(commentedEnvValues.WORKOS_AUTHKIT_HOSTNAME, undefined);
		assert.strictEqual(runtimeEnvExample.WORKOS_AUTHKIT_HOSTNAME, undefined);
		assert.match(runtimeEnvExample.WORKOS_COOKIE_PASSWORD, /^[a-f0-9]{64}$/i);
		assert.match(
			runtimeEnvExample.AUTH_ERROR_SIGNING_SECRET,
			/^[a-f0-9]{64}$/i
		);
		assert.match(
			runtimeEnvExample.AVATAR_PROXY_SIGNING_SECRET,
			/^[a-f0-9]{64}$/i
		);
	});
});
