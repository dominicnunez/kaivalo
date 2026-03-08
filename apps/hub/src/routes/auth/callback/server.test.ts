import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	AUTH_ERROR_QUERY_NAME,
	AUTH_ERROR_QUERY_VALUE,
	AUTH_ERROR_TIMESTAMP_QUERY_NAME,
	readVerifiedAuthError
} from '$lib/auth/auth-error-query.js';

const { mockEnv, mockHandleCallback } = vi.hoisted(() => ({
	mockEnv: {
		WORKOS_CLIENT_ID: 'client_123',
		WORKOS_API_KEY: 'sk_test_123',
		WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
		WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
		ORIGIN: 'https://kaivalo.test',
		NODE_ENV: 'production'
	} as Record<string, string>,
	mockHandleCallback: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

vi.mock('@workos/authkit-sveltekit', () => ({
	authKit: {
		handleCallback: mockHandleCallback
	}
}));

function createEvent(headers: HeadersInit = {}) {
	return {
		request: new Request('https://kaivalo.test/auth/callback', {
			headers
		}),
		url: new URL('https://kaivalo.test/auth/callback')
	} as never;
}

describe('auth callback route', () => {
	beforeEach(() => {
		vi.resetModules();
		mockHandleCallback.mockReset();
	});

	it('returns the upstream callback response for successful requests', async () => {
		mockHandleCallback.mockReturnValue(
			async () => new Response('ok', { status: 200 })
		);

		const { GET } = await import('./+server');
		const response = await GET(createEvent());

		expect(response.status).toBe(200);
		await expect(response.text()).resolves.toBe('ok');
		expect(mockHandleCallback).toHaveBeenCalledOnce();
	});

	it('redirects browser callback failures with a verified signed auth error', async () => {
		mockHandleCallback.mockReturnValue(async () => {
			throw new Error('upstream unavailable');
		});

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
					secret: mockEnv.WORKOS_COOKIE_PASSWORD,
					now: Number(
						location.searchParams.get(AUTH_ERROR_TIMESTAMP_QUERY_NAME)
					)
				})
			).toEqual({
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: expect.stringMatching(/^authcb_/)
			});
		}
	});
});
