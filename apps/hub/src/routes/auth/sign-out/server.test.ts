import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv, mockShouldIncludeErrorMessage, mockAuthKit } = vi.hoisted(
	() => ({
		mockEnv: {
			WORKOS_CLIENT_ID: 'client_123',
			WORKOS_API_KEY: 'sk_test_123',
			WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
			WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
			AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
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
		mockEnv.WORKOS_API_HOSTNAME = 'auth.kaivalo-login.com';
		delete mockEnv.WORKOS_AUTHKIT_HOSTNAME;
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

	it('trusts a dedicated AuthKit hostname when it differs from the api host', async () => {
		mockEnv.WORKOS_API_HOSTNAME = 'api-auth.kaivalo-login.com';
		mockEnv.WORKOS_AUTHKIT_HOSTNAME = 'login.kaivalo-login.com';
		mockAuthKit.signOut.mockResolvedValueOnce(
			Response.redirect(
				'https://login.kaivalo-login.com/user_management/sessions/logout?session_id=session_123&return_to=https%3A%2F%2Fkaivalo.test',
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
		expect(response.headers.get('location')).toBe(
			'https://login.kaivalo-login.com/user_management/sessions/logout?session_id=session_123&return_to=https%3A%2F%2Fkaivalo.test'
		);
	});
});
