import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv, mockShouldIncludeErrorMessage, mockAuthKit } = vi.hoisted(
	() => ({
		mockEnv: {
			WORKOS_CLIENT_ID: 'client_123',
			WORKOS_API_KEY: 'sk_test_123',
			WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
			WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
			AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
			AVATAR_PROXY_SIGNING_SECRET: 'ef'.repeat(32),
			WORKOS_API_HOSTNAME: 'auth.kaivalo-login.com',
			ORIGIN: 'https://kaivalo.test'
		} as Record<string, string>,
		mockShouldIncludeErrorMessage: vi.fn(() => false),
		mockAuthKit: {
			signOut: vi.fn()
		}
	})
);

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

vi.mock('@workos/authkit-sveltekit', () => ({
	authKit: mockAuthKit
}));

vi.mock('$lib/server/error-diagnostics.ts', async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		shouldIncludeErrorMessage: mockShouldIncludeErrorMessage
	};
});

describe('auth sign-out route', () => {
	beforeEach(() => {
		vi.resetModules();
		mockEnv.WORKOS_CLIENT_ID = 'client_123';
		mockEnv.WORKOS_API_KEY = 'sk_test_123';
		mockEnv.WORKOS_REDIRECT_URI = 'https://kaivalo.test/auth/callback';
		mockEnv.WORKOS_COOKIE_PASSWORD = 'ab'.repeat(32);
		mockEnv.AUTH_ERROR_SIGNING_SECRET = 'cd'.repeat(32);
		mockEnv.AVATAR_PROXY_SIGNING_SECRET = 'ef'.repeat(32);
		mockEnv.WORKOS_API_HOSTNAME = 'auth.kaivalo-login.com';
		mockEnv.ORIGIN = 'https://kaivalo.test';
		mockAuthKit.signOut.mockReset();
	});

	it('preserves authenticated WorkOS logout redirects on the configured auth host', async () => {
		mockAuthKit.signOut.mockResolvedValueOnce(
			Response.redirect(
				'https://auth.kaivalo-login.com/user_management/sessions/logout?session_id=session_123&return_to=https%3A%2F%2Fkaivalo.test',
				302
			)
		);

		const { POST } = await import('./+server');
		const response = await POST({
			request: new Request('https://attacker.test/auth/sign-out', {
				method: 'POST',
				headers: {
					origin: 'https://kaivalo.test'
				}
			}),
			url: new URL('https://attacker.test/auth/sign-out')
		} as never);

		expect(response.status).toBe(302);
		expect(mockAuthKit.signOut).toHaveBeenCalledOnce();
		expect(response.headers.get('location')).toBe(
			'https://auth.kaivalo-login.com/user_management/sessions/logout?session_id=session_123&return_to=https%3A%2F%2Fkaivalo.test'
		);
	});

	it('fails fast when the sign-out route is initialized without required auth env', async () => {
		delete mockEnv.WORKOS_CLIENT_ID;

		const { POST } = await import('./+server');

		expect(() =>
			POST({
				request: new Request('https://kaivalo.test/auth/sign-out', {
					method: 'POST',
					headers: {
						origin: 'https://kaivalo.test'
					}
				}),
				url: new URL('https://kaivalo.test/auth/sign-out')
			} as never)
		).toThrow(/Missing required environment variable: WORKOS_CLIENT_ID/);
		expect(mockAuthKit.signOut).not.toHaveBeenCalled();
	});
});
