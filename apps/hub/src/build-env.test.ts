import { describe, expect, it } from 'vitest';

import { getHubBuildEnv, getHubPreviewEnv } from '../scripts/build-env.ts';

describe('hub build environment', () => {
	it('fails fast when required auth env is missing for deploy-style builds', () => {
		expect(() => getHubBuildEnv({})).toThrow(
			/Missing required environment variable: WORKOS_CLIENT_ID/
		);
	});

	it('allows placeholder auth env only for explicit local placeholder builds', () => {
		const buildEnv = getHubBuildEnv({
			HUB_BUILD_ALLOW_PLACEHOLDERS: 'true'
		});

		expect(buildEnv.WORKOS_CLIENT_ID).toBe('client_build_placeholder');
		expect(buildEnv.WORKOS_API_KEY).toBe('sk_build_placeholder');
		expect(buildEnv.WORKOS_REDIRECT_URI).toBe(
			'http://localhost:3100/auth/callback'
		);
		expect(buildEnv.ORIGIN).toBe('http://localhost:3100');
	});

	it('allows placeholder auth env in test mode', () => {
		const buildEnv = getHubBuildEnv({
			NODE_ENV: 'test'
		});

		expect(buildEnv.WORKOS_CLIENT_ID).toBe('client_build_placeholder');
		expect(buildEnv.AUTH_ERROR_SIGNING_SECRET).toBe('cd'.repeat(32));
	});

	it('fills missing preview auth env with local placeholder values', () => {
		const previewEnv = getHubPreviewEnv({
			PORT: '4173'
		});

		expect(previewEnv.NODE_ENV).toBe('production');
		expect(previewEnv.WORKOS_CLIENT_ID).toBe('client_build_placeholder');
		expect(previewEnv.WORKOS_REDIRECT_URI).toBe(
			'http://localhost:4173/auth/callback'
		);
		expect(previewEnv.ORIGIN).toBe('http://localhost:4173');
	});

	it('preserves explicit preview auth env values', () => {
		const previewEnv = getHubPreviewEnv({
			NODE_ENV: 'staging',
			WORKOS_CLIENT_ID: 'client_live',
			WORKOS_API_KEY: 'sk_live',
			WORKOS_REDIRECT_URI: 'https://hub.kaivalo.com/auth/callback',
			WORKOS_COOKIE_PASSWORD: 'ef'.repeat(32),
			AUTH_ERROR_SIGNING_SECRET: '12'.repeat(32),
			ORIGIN: 'https://hub.kaivalo.com'
		});

		expect(previewEnv.NODE_ENV).toBe('staging');
		expect(previewEnv.WORKOS_CLIENT_ID).toBe('client_live');
		expect(previewEnv.WORKOS_REDIRECT_URI).toBe(
			'https://hub.kaivalo.com/auth/callback'
		);
		expect(previewEnv.ORIGIN).toBe('https://hub.kaivalo.com');
	});
});
