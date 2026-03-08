import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handleCallback, signOut, getUser, privateEnv } = vi.hoisted(() => ({
	handleCallback: vi.fn(),
	signOut: vi.fn(),
	getUser: vi.fn(),
	privateEnv: {
		NODE_ENV: 'test',
		KAIVALO_ENABLE_TEST_AUTH_FIXTURE: '1'
	} as Record<string, string>
}));

vi.mock('@workos/authkit-sveltekit', () => ({
	authKit: {
		handleCallback,
		signOut,
		getUser
	}
}));

vi.mock('$env/dynamic/private', () => ({
	env: privateEnv
}));

import { getAuthRouteHandlers, getAuthUser } from './authkit-runtime';

describe('getAuthRouteHandlers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		privateEnv.NODE_ENV = 'test';
		privateEnv.KAIVALO_ENABLE_TEST_AUTH_FIXTURE = '1';
	});

	it('falls back to the shipped WorkOS handlers when no test fixtures are present', async () => {
		const callbackResponse = new Response(null, { status: 302 });
		const signOutResponse = new Response(null, { status: 302 });
		handleCallback.mockReturnValue(vi.fn().mockResolvedValue(callbackResponse));
		signOut.mockResolvedValue(signOutResponse);

		const handlers = getAuthRouteHandlers();
		const callbackHandler = handlers.handleCallback();
		const callbackEvent = {
			request: new Request('https://kaivalo.test/auth/callback'),
			url: new URL('https://kaivalo.test/auth/callback')
		} as Parameters<ReturnType<typeof handlers.handleCallback>>[0];
		const signOutEvent = {
			request: new Request('https://kaivalo.test/auth/sign-out', {
				method: 'POST'
			}),
			url: new URL('https://kaivalo.test/auth/sign-out')
		} as Parameters<typeof handlers.signOut>[0];

		await expect(callbackHandler(callbackEvent)).resolves.toBe(
			callbackResponse
		);
		await expect(handlers.signOut(signOutEvent)).resolves.toBe(signOutResponse);
		expect(handleCallback).toHaveBeenCalledTimes(1);
		expect(signOut).toHaveBeenCalledWith(signOutEvent);
	});

	it('mints a deterministic test session from callback fixtures', async () => {
		const handlers = getAuthRouteHandlers();
		const callbackHandler = handlers.handleCallback();
		const response = await callbackHandler({
			request: new Request(
				'https://kaivalo.test/auth/callback?code=test-code',
				{
					headers: {
						'x-kaivalo-test-auth-user': Buffer.from(
							JSON.stringify({
								firstName: 'Kai',
								email: 'kai@example.com',
								profilePictureUrl: 'https://avatars.githubusercontent.com/u/1'
							})
						).toString('base64url'),
						'x-kaivalo-test-auth-return-to':
							'https://kaivalo.test/account?from=auth#done'
					}
				}
			),
			url: new URL('https://kaivalo.test/auth/callback?code=test-code')
		} as Parameters<ReturnType<typeof handlers.handleCallback>>[0]);

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe(
			'https://kaivalo.test/account?from=auth#done'
		);
		expect(response.headers.get('set-cookie')).toContain(
			'kaivalo_test_auth_session='
		);
		expect(handleCallback).not.toHaveBeenCalled();
	});

	it('clears deterministic test sessions during sign-out fixtures', async () => {
		const handlers = getAuthRouteHandlers();
		const response = await handlers.signOut({
			request: new Request('https://kaivalo.test/auth/sign-out', {
				method: 'POST',
				headers: {
					cookie: `kaivalo_test_auth_session=${encodeURIComponent(
						Buffer.from(
							JSON.stringify({
								firstName: 'Kai',
								email: 'kai@example.com'
							})
						).toString('base64url')
					)}`,
					'x-kaivalo-test-auth-sign-out-return-to':
						'https://kaivalo.test/goodbye?from=sign-out#done'
				}
			}),
			url: new URL('https://kaivalo.test/auth/sign-out')
		} as Parameters<typeof handlers.signOut>[0]);

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe(
			'https://kaivalo.test/goodbye?from=sign-out#done'
		);
		expect(response.headers.get('set-cookie')).toContain(
			'kaivalo_test_auth_session='
		);
		expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
		expect(signOut).not.toHaveBeenCalled();
	});

	it('returns a deterministic test fixture user when the preview header is present', async () => {
		const event = {
			request: new Request('https://kaivalo.test', {
				headers: {
					'x-kaivalo-test-auth-user': Buffer.from(
						JSON.stringify({
							firstName: 'Kai',
							email: 'kai@example.com',
							profilePictureUrl: 'https://avatars.githubusercontent.com/u/1'
						})
					).toString('base64url')
				}
			})
		} as Parameters<typeof getAuthUser>[0];

		await expect(getAuthUser(event)).resolves.toEqual({
			firstName: 'Kai',
			email: 'kai@example.com',
			profilePictureUrl: 'https://avatars.githubusercontent.com/u/1'
		});
		expect(getUser).not.toHaveBeenCalled();
	});

	it('falls back to WorkOS user lookup when the test fixture header is absent', async () => {
		getUser.mockResolvedValue({
			firstName: 'WorkOS',
			email: 'user@example.com',
			profilePictureUrl: null
		});
		const event = {
			request: new Request('https://kaivalo.test')
		} as Parameters<typeof getAuthUser>[0];

		await expect(getAuthUser(event)).resolves.toEqual({
			firstName: 'WorkOS',
			email: 'user@example.com',
			profilePictureUrl: null
		});
		expect(getUser).toHaveBeenCalledWith(event);
	});

	it('treats malformed fixture headers as unauthenticated test requests', async () => {
		const event = {
			request: new Request('https://kaivalo.test', {
				headers: {
					'x-kaivalo-test-auth-user': 'not-base64url-json'
				}
			})
		} as Parameters<typeof getAuthUser>[0];

		await expect(getAuthUser(event)).resolves.toBeNull();
		expect(getUser).not.toHaveBeenCalled();
	});

	it('reads deterministic session fixtures from cookies before consulting WorkOS', async () => {
		const event = {
			request: new Request('https://kaivalo.test', {
				headers: {
					cookie: `kaivalo_test_auth_session=${encodeURIComponent(
						Buffer.from(
							JSON.stringify({
								firstName: 'Kai',
								email: 'kai@example.com'
							})
						).toString('base64url')
					)}`
				}
			})
		} as Parameters<typeof getAuthUser>[0];

		await expect(getAuthUser(event)).resolves.toEqual({
			firstName: 'Kai',
			email: 'kai@example.com',
			profilePictureUrl: null
		});
		expect(getUser).not.toHaveBeenCalled();
	});

	it('ignores fixture headers outside the test environment', async () => {
		privateEnv.NODE_ENV = 'production';
		getUser.mockResolvedValue({
			firstName: 'Prod',
			email: 'user@example.com',
			profilePictureUrl: null
		});
		const event = {
			request: new Request('https://kaivalo.test', {
				headers: {
					'x-kaivalo-test-auth-user': Buffer.from(
						JSON.stringify({
							firstName: 'Kai',
							email: 'kai@example.com'
						})
					).toString('base64url')
				}
			})
		} as Parameters<typeof getAuthUser>[0];

		await expect(getAuthUser(event)).resolves.toEqual({
			firstName: 'Prod',
			email: 'user@example.com',
			profilePictureUrl: null
		});
		expect(getUser).toHaveBeenCalledWith(event);
	});

	it('ignores fixture headers when the feature flag is disabled', async () => {
		privateEnv.KAIVALO_ENABLE_TEST_AUTH_FIXTURE = '0';
		getUser.mockResolvedValue({
			firstName: 'WorkOS',
			email: 'user@example.com',
			profilePictureUrl: null
		});
		const event = {
			request: new Request('https://kaivalo.test', {
				headers: {
					'x-kaivalo-test-auth-user': Buffer.from(
						JSON.stringify({
							firstName: 'Kai',
							email: 'kai@example.com'
						})
					).toString('base64url')
				}
			})
		} as Parameters<typeof getAuthUser>[0];

		await expect(getAuthUser(event)).resolves.toEqual({
			firstName: 'WorkOS',
			email: 'user@example.com',
			profilePictureUrl: null
		});
		expect(getUser).toHaveBeenCalledWith(event);
	});
});
