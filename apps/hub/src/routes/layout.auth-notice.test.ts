import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_NOTICE_SIGN_IN_CANCELLED_MESSAGE } from '$lib/auth/auth-notice-query.ts';

const { mockEnv, mockGetUser, mockGetValidatedWorkosEnv } = vi.hoisted(() => ({
	mockEnv: {
		WORKOS_CLIENT_ID: 'client_123',
		WORKOS_API_KEY: 'sk_test_123',
		WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
		WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
		AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
		AVATAR_PROXY_SIGNING_SECRET: 'ef'.repeat(32),
		ORIGIN: 'https://kaivalo.test'
	} as Record<string, string>,
	mockGetUser: vi.fn(),
	mockGetValidatedWorkosEnv: vi.fn(() => ({
		origin: 'https://kaivalo.test',
		redirectUri: 'https://kaivalo.test/auth/callback',
		apiHostname: 'api.workos.com'
	}))
}));

vi.mock('@workos/authkit-sveltekit', () => ({
	authKit: {
		getUser: mockGetUser
	}
}));

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

vi.mock('$lib/server/workos-security.ts', async () => {
	const actual = await vi.importActual<
		typeof import('$lib/server/workos-security.ts')
	>('$lib/server/workos-security.ts');
	return {
		...actual,
		getValidatedWorkosEnv: mockGetValidatedWorkosEnv
	};
});

import { load } from './+layout.server';

function createEvent(url: string) {
	return {
		url: new URL(url),
		request: new Request(url),
		getClientAddress: () => '127.0.0.1'
	};
}

describe('layout auth notice handling', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockEnv.ORIGIN = 'https://kaivalo.test';
		mockEnv.WORKOS_REDIRECT_URI = 'https://kaivalo.test/auth/callback';
		mockGetValidatedWorkosEnv.mockReturnValue({
			origin: 'https://kaivalo.test',
			redirectUri: 'https://kaivalo.test/auth/callback',
			apiHostname: 'api.workos.com'
		} as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('preserves recognized auth notices for unauthenticated users', async () => {
		mockGetUser.mockResolvedValue(null as never);
		const setHeaders = vi.fn();

		const result = await load({
			...createEvent('https://kaivalo.test/?notice=sign_in_cancelled'),
			setHeaders
		} as never);

		expect(result).toEqual({
			user: null,
			signInUrl: '/auth/sign-in',
			authError: {
				message: AUTH_NOTICE_SIGN_IN_CANCELLED_MESSAGE,
				incidentId: null
			}
		});
		expect(setHeaders).toHaveBeenCalledWith({
			'cache-control': 'private, no-store',
			vary: 'Cookie, Authorization'
		});
	});

	it('ignores auth notices once the user is authenticated', async () => {
		mockGetUser.mockResolvedValue({
			firstName: 'Kai',
			email: 'kai@example.com',
			profilePictureUrl: 'https://avatars.githubusercontent.com/u/1'
		} as never);
		const setHeaders = vi.fn();

		const result = await load({
			...createEvent('https://kaivalo.test/?notice=sign_in_cancelled'),
			setHeaders
		} as never);

		expect(result).toMatchObject({
			user: {
				firstName: 'Kai',
				email: 'kai@example.com'
			},
			signInUrl: null,
			authError: null
		});
		expect(setHeaders).not.toHaveBeenCalled();
	});
});
