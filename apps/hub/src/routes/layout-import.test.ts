import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv, mockGetUser } = vi.hoisted(() => ({
	mockEnv: {
		WORKOS_CLIENT_ID: 'client_123',
		WORKOS_API_KEY: 'sk_test_123',
		WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
		WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
		AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
		ORIGIN: 'https://kaivalo.test'
	} as Record<string, string>,
	mockGetUser: vi.fn()
}));

vi.mock('@workos/authkit-sveltekit', () => ({
	authKit: {
		getUser: mockGetUser
	}
}));

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

describe('layout module import', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		delete mockEnv.DEV_AUTH_BYPASS;
		delete mockEnv.DEV_AUTH_BYPASS_EMAIL;
		delete mockEnv.DEV_AUTH_BYPASS_FIRST_NAME;
		delete mockEnv.NODE_ENV;
		mockEnv.ORIGIN = 'https://kaivalo.test';
		mockEnv.WORKOS_REDIRECT_URI = 'https://kaivalo.test/auth/callback';
	});

	it('does not throw at import time for malformed development bypass config', async () => {
		mockEnv.NODE_ENV = 'development';
		mockEnv.DEV_AUTH_BYPASS = 'true';
		mockEnv.ORIGIN = 'http://staging.kaivalo.com';
		mockEnv.WORKOS_REDIRECT_URI = 'http://staging.kaivalo.com/auth/callback';

		await expect(import('./+layout.server')).resolves.toHaveProperty('load');
	});
});
