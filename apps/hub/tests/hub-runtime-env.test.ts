import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	applyHubRuntimeEnv,
	getHubPreviewBaseEnv
} from '../scripts/runtime-env.ts';
import {
	createHubBuiltRuntimeEnv,
	createHubPreviewEnv,
	createHubPreviewScriptEnv,
	sanitizeHubRuntimeEnv
} from './helpers/hub-runtime-env.ts';

describe('hub runtime env helpers', () => {
	it('scrubs the full managed runtime env denylist from inherited envs', () => {
		const inheritedEnv = {
			ADDRESS_HEADER: 'x-forwarded-for',
			AUTH_ERROR_SIGNING_SECRET: 'bad-secret',
			AVATAR_PROXY_SIGNING_SECRET: 'bad-avatar-secret',
			HOST: '0.0.0.0',
			NODE_ENV: 'development',
			NODE_OPTIONS: '--inspect',
			ORIGIN: 'https://preview.example.com',
			PORT: '9000',
			TRUSTED_PROXY_IPS: '203.0.113.1',
			TRUST_X_FORWARDED_PROTO: 'true',
			WORKOS_API_KEY: 'sk_live',
			WORKOS_CLIENT_ID: 'client_live',
			WORKOS_COOKIE_PASSWORD: 'bad-cookie',
			WORKOS_REDIRECT_URI: 'https://preview.example.com/auth/callback',
			XFF_DEPTH: '1',
			KEEP_ME: 'present'
		};

		assert.deepStrictEqual(sanitizeHubRuntimeEnv(inheritedEnv), {
			KEEP_ME: 'present'
		});

		const previewEnv = createHubPreviewEnv({
			baseEnv: inheritedEnv,
			port: 4173
		});
		assert.strictEqual(previewEnv.ADDRESS_HEADER, undefined);
		assert.strictEqual(previewEnv.NODE_OPTIONS, undefined);
		assert.strictEqual(previewEnv.TRUST_X_FORWARDED_PROTO, undefined);
		assert.strictEqual(previewEnv.TRUSTED_PROXY_IPS, undefined);
		assert.strictEqual(previewEnv.XFF_DEPTH, undefined);
		assert.strictEqual(previewEnv.AUTH_ERROR_SIGNING_SECRET, 'cd'.repeat(32));
		assert.strictEqual(previewEnv.AVATAR_PROXY_SIGNING_SECRET, 'ef'.repeat(32));
		assert.strictEqual(previewEnv.WORKOS_API_KEY, 'sk_test_fixture');
		assert.strictEqual(previewEnv.WORKOS_CLIENT_ID, 'client_test_fixture');
		assert.strictEqual(previewEnv.WORKOS_COOKIE_PASSWORD, 'ab'.repeat(32));
		assert.strictEqual(
			previewEnv.WORKOS_REDIRECT_URI,
			'http://127.0.0.1:4173/auth/callback'
		);
		assert.strictEqual(previewEnv.KEEP_ME, 'present');

		const builtEnv = createHubBuiltRuntimeEnv({
			baseEnv: inheritedEnv,
			port: 4173
		});
		assert.strictEqual(builtEnv.ADDRESS_HEADER, undefined);
		assert.strictEqual(builtEnv.NODE_OPTIONS, undefined);
		assert.strictEqual(builtEnv.TRUST_X_FORWARDED_PROTO, undefined);
		assert.strictEqual(builtEnv.TRUSTED_PROXY_IPS, undefined);
		assert.strictEqual(builtEnv.XFF_DEPTH, undefined);
		assert.strictEqual(builtEnv.AUTH_ERROR_SIGNING_SECRET, 'cd'.repeat(32));
		assert.strictEqual(builtEnv.AVATAR_PROXY_SIGNING_SECRET, 'ef'.repeat(32));
		assert.strictEqual(builtEnv.WORKOS_API_KEY, 'sk_test_fixture');
		assert.strictEqual(builtEnv.WORKOS_CLIENT_ID, 'client_test_fixture');
		assert.strictEqual(builtEnv.WORKOS_COOKIE_PASSWORD, 'ab'.repeat(32));
		assert.strictEqual(
			builtEnv.WORKOS_REDIRECT_URI,
			'http://127.0.0.1:4173/auth/callback'
		);
		assert.strictEqual(builtEnv.KEEP_ME, 'present');
	});

	it('allows preview script envs to opt into a non-production node environment', () => {
		const previewScriptEnv = createHubPreviewScriptEnv({
			port: 4173,
			nodeEnv: 'development'
		});

		assert.strictEqual(previewScriptEnv.NODE_ENV, 'development');
		assert.strictEqual(previewScriptEnv.HOST, '127.0.0.1');
		assert.strictEqual(previewScriptEnv.PORT, '4173');
	});

	it('replaces only the managed hub runtime subset when applying runtime env', () => {
		const targetEnv = {
			ADDRESS_HEADER: 'x-forwarded-for',
			NODE_OPTIONS: '--inspect',
			WORKOS_CLIENT_ID: 'client_old',
			WORKOS_API_KEY: 'sk_old',
			WORKOS_COOKIE_PASSWORD: 'old-cookie',
			AUTH_ERROR_SIGNING_SECRET: 'old-secret',
			AVATAR_PROXY_SIGNING_SECRET: 'old-avatar-secret',
			UNRELATED: 'keep'
		};

		applyHubRuntimeEnv(targetEnv, {
			ORIGIN: 'http://127.0.0.1:4173',
			WORKOS_CLIENT_ID: 'client_test_fixture',
			WORKOS_API_KEY: 'sk_test_fixture',
			WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
			CUSTOM_FLAG: 'enabled',
			UNRELATED: undefined
		});

		assert.deepStrictEqual(targetEnv, {
			ORIGIN: 'http://127.0.0.1:4173',
			WORKOS_CLIENT_ID: 'client_test_fixture',
			WORKOS_API_KEY: 'sk_test_fixture',
			WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
			CUSTOM_FLAG: 'enabled'
		});
	});

	it('selects only preview-allowed input env for preview child processes', () => {
		const previewBaseEnv = getHubPreviewBaseEnv({
			AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
			AVATAR_PROXY_SIGNING_SECRET: 'ef'.repeat(32),
			HOST: '127.0.0.1',
			NODE_ENV: 'development',
			NODE_OPTIONS: '--inspect',
			ORIGIN: 'http://127.0.0.1:4173',
			PORT: '4173',
			TRUSTED_PROXY_IPS: '203.0.113.1',
			TRUST_X_FORWARDED_PROTO: 'true',
			WORKOS_API_KEY: 'sk_test_fixture',
			WORKOS_CLIENT_ID: 'client_test_fixture',
			WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
			WORKOS_REDIRECT_URI: 'http://127.0.0.1:4173/auth/callback',
			XFF_DEPTH: '1'
		});

		assert.deepStrictEqual(previewBaseEnv, {
			AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
			AVATAR_PROXY_SIGNING_SECRET: 'ef'.repeat(32),
			HOST: '127.0.0.1',
			NODE_ENV: 'development',
			ORIGIN: 'http://127.0.0.1:4173',
			PORT: '4173',
			WORKOS_API_KEY: 'sk_test_fixture',
			WORKOS_CLIENT_ID: 'client_test_fixture',
			WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
			WORKOS_REDIRECT_URI: 'http://127.0.0.1:4173/auth/callback'
		});
	});
});
