import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	getProxyTrustConfiguration,
	getValidatedWorkosEnv
} from '../apps/hub/src/lib/server/workos-security.js';

const envExamplePath = resolve(
	import.meta.dirname,
	'..',
	'apps',
	'hub',
	'.env.example'
);
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
	const fixtureSecrets = {
		WORKOS_CLIENT_ID: 'client_fixture',
		WORKOS_API_KEY: 'sk_fixture',
		WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32)
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
		const commentedPairs = content
			.split('\n')
			.map((line) => line.trim())
			.filter(
				(line) =>
					line.startsWith('# WORKOS_REDIRECT_URI=') ||
					line.startsWith('# ORIGIN=')
			)
			.map((line) => line.slice(2));

		const parsedPairs = parseEnvTemplate(commentedPairs.join('\n'));
		const validated = getValidatedWorkosEnv({
			...parsedPairs,
			...fixtureSecrets,
			NODE_ENV: 'production'
		});

		assert.strictEqual(
			validated.redirectUri,
			'https://hub.kaivalo.com/auth/callback'
		);
		assert.strictEqual(validated.origin, 'https://hub.kaivalo.com');
	});

	it('documents deployment guidance that matches runtime validation expectations', () => {
		assert.match(content, /64 hex chars/i);
		assert.match(content, /mandatory for production https origins/i);
		assert.match(content, /TRUST_X_FORWARDED_PROTO=true/i);
	});
});
