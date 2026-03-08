import { beforeEach, describe, expect, it, vi } from 'vitest';

const { handleCallback, signOut, getUser } = vi.hoisted(() => ({
	handleCallback: vi.fn(),
	signOut: vi.fn(),
	getUser: vi.fn()
}));

vi.mock('@workos/authkit-sveltekit', () => ({
	authKit: {
		handleCallback,
		signOut,
		getUser
	}
}));

import { getAuthRouteHandlers, getAuthUser } from './authkit-runtime';

describe('auth runtime', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('delegates callback handling to AuthKit', async () => {
		const callbackResponse = new Response(null, { status: 302 });
		const upstreamHandler = vi.fn().mockResolvedValue(callbackResponse);
		handleCallback.mockReturnValue(upstreamHandler);

		const handlers = getAuthRouteHandlers();
		const event = {
			request: new Request('https://kaivalo.test/auth/callback'),
			url: new URL('https://kaivalo.test/auth/callback')
		} as Parameters<ReturnType<typeof handlers.handleCallback>>[0];

		await expect(handlers.handleCallback()(event)).resolves.toBe(
			callbackResponse
		);
		expect(handleCallback).toHaveBeenCalledTimes(1);
		expect(upstreamHandler).toHaveBeenCalledWith(event);
	});

	it('delegates sign-out handling to AuthKit', async () => {
		const signOutResponse = new Response(null, { status: 302 });
		signOut.mockResolvedValue(signOutResponse);

		const handlers = getAuthRouteHandlers();
		const event = {
			request: new Request('https://kaivalo.test/auth/sign-out', {
				method: 'POST'
			}),
			url: new URL('https://kaivalo.test/auth/sign-out')
		} as Parameters<typeof handlers.signOut>[0];

		await expect(handlers.signOut(event)).resolves.toBe(signOutResponse);
		expect(signOut).toHaveBeenCalledWith(event);
	});

	it('delegates user lookup to AuthKit', async () => {
		getUser.mockResolvedValue({
			firstName: 'Kai',
			email: 'kai@example.com',
			profilePictureUrl: null
		});
		const event = {
			request: new Request('https://kaivalo.test')
		} as Parameters<typeof getAuthUser>[0];

		await expect(getAuthUser(event)).resolves.toEqual({
			firstName: 'Kai',
			email: 'kai@example.com',
			profilePictureUrl: null
		});
		expect(getUser).toHaveBeenCalledWith(event);
	});
});
