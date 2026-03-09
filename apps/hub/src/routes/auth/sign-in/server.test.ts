import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	AUTH_ERROR_QUERY_NAME,
	AUTH_ERROR_QUERY_VALUE,
	AUTH_ERROR_TIMESTAMP_QUERY_NAME,
	readVerifiedAuthError
} from '$lib/auth/auth-error-query.ts';

const { mockEnv, mockGetSignInUrl } = vi.hoisted(() => ({
	mockEnv: {
		WORKOS_CLIENT_ID: 'client_123',
		WORKOS_API_KEY: 'sk_test_123',
		WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
		WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
		AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
		WORKOS_API_HOSTNAME: 'auth.kaivalo-login.com',
		ORIGIN: 'https://kaivalo.test',
		NODE_ENV: 'production'
	} as Record<string, string>,
	mockGetSignInUrl: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

vi.mock('@workos/authkit-sveltekit', () => ({
	authKit: {
		getSignInUrl: mockGetSignInUrl
	}
}));

function createEvent(
	headers: HeadersInit = {},
	requestUrl = 'https://kaivalo.test/auth/sign-in'
) {
	return {
		request: new Request(requestUrl, {
			headers
		}),
		url: new URL(requestUrl)
	} as never;
}

describe('auth sign-in route', () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.resetModules();
		mockGetSignInUrl.mockReset();
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		errorSpy.mockRestore();
	});

	it('redirects to the trusted WorkOS sign-in URL', async () => {
		mockGetSignInUrl.mockResolvedValue(
			'https://auth.kaivalo-login.com/user_management/authorize?screen_hint=sign-up' as never
		);

		const { GET } = await import('./+server');

		await expect(GET(createEvent())).rejects.toMatchObject({
			status: 303,
			location:
				'https://auth.kaivalo-login.com/user_management/authorize?screen_hint=sign-up'
		});
		expect(mockGetSignInUrl).toHaveBeenCalledWith({ returnTo: '/services' });
	});

	it('normalizes trusted same-origin destinations that do not point back to the sign-in route', async () => {
		mockGetSignInUrl.mockResolvedValue(
			'https://kaivalo.test/services?welcome=1#hero' as never
		);

		const { GET } = await import('./+server');

		await expect(GET(createEvent())).rejects.toMatchObject({
			status: 303,
			location: '/services?welcome=1#hero'
		});
	});

	it('rejects same-origin sign-in destinations that loop back to the route itself', async () => {
		mockGetSignInUrl.mockResolvedValue(
			'https://kaivalo.test/auth/sign-in?screen_hint=sign-up#hero' as never
		);

		const { GET } = await import('./+server');

		await expect(
			GET(
				createEvent({
					accept: 'application/json'
				})
			)
		).rejects.toMatchObject({
			status: 503,
			body: {
				message: expect.stringMatching(/^Sign-in failed\. Reference: authsign_/)
			}
		});
		expect(errorSpy).toHaveBeenCalledOnce();
		expect(errorSpy.mock.calls.at(-1)?.[0]).toBe('Sign-in failed');
	});

	it('rejects sign-in URLs on untrusted origins', async () => {
		mockGetSignInUrl.mockResolvedValue('https://evil.example/login' as never);

		const { GET } = await import('./+server');

		await expect(
			GET(
				createEvent({
					accept: 'application/json'
				})
			)
		).rejects.toMatchObject({
			status: 503,
			body: {
				message: expect.stringMatching(/^Sign-in failed\. Reference: authsign_/)
			}
		});
		expect(errorSpy).toHaveBeenCalledOnce();
		expect(errorSpy.mock.calls.at(-1)?.[0]).toBe('Sign-in failed');
	});

	it('redirects browser failures back to the landing page with a signed auth error', async () => {
		mockGetSignInUrl.mockRejectedValue(new Error('upstream unavailable'));

		const { GET } = await import('./+server');

		try {
			await GET(
				createEvent({
					accept: 'text/html',
					'sec-fetch-mode': 'navigate'
				})
			);
			throw new Error('expected GET to redirect');
		} catch (thrown) {
			expect(thrown).toMatchObject({
				status: 303,
				location: expect.any(String)
			});

			if (
				typeof thrown !== 'object' ||
				thrown === null ||
				!('location' in thrown) ||
				typeof thrown.location !== 'string'
			) {
				throw thrown;
			}

			const location = new URL(thrown.location, mockEnv.ORIGIN);
			expect(location.pathname).toBe('/');
			expect(location.searchParams.get(AUTH_ERROR_QUERY_NAME)).toBe(
				AUTH_ERROR_QUERY_VALUE
			);
			expect(
				readVerifiedAuthError(location.searchParams, {
					secret: mockEnv.AUTH_ERROR_SIGNING_SECRET,
					now: Number(
						location.searchParams.get(AUTH_ERROR_TIMESTAMP_QUERY_NAME)
					)
				})
			).toEqual({
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: expect.stringMatching(/^authsign_/)
			});
			expect(errorSpy).toHaveBeenCalledOnce();
			expect(errorSpy.mock.calls.at(-1)?.[0]).toBe('Sign-in failed');
		}
	});
});
