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

	it('always returns the shipped WorkOS handlers', () => {
		expect(getAuthRouteHandlers()).toEqual({
			handleCallback,
			signOut
		});
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
});
