import { describe, expect, it } from 'vitest';

import { getHubBuildEnv } from '../scripts/build-env.ts';

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
});
