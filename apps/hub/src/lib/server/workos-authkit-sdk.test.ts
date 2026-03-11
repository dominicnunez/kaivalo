import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkOS AuthKit SDK hostname behavior', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('builds hosted sign-in URLs from apiHostname in the installed SDK', async () => {
		const { authKit, configureAuthKit } =
			await import('@workos/authkit-sveltekit');

		configureAuthKit({
			clientId: 'client_123',
			apiKey: 'sk_test_123',
			redirectUri: 'https://kaivalo.test/auth/callback',
			cookiePassword: 'ab'.repeat(32),
			apiHostname: 'auth.kaivalo-login.test'
		});

		const signInUrl = await authKit.getSignInUrl({ returnTo: '/services' });
		const parsed = new URL(signInUrl);

		expect(parsed.origin).toBe('https://auth.kaivalo-login.test');
		expect(parsed.pathname).toBe('/user_management/authorize');
		expect(parsed.searchParams.get('redirect_uri')).toBe(
			'https://kaivalo.test/auth/callback'
		);
	});
});
