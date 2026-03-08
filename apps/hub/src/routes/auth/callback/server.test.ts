import { describe, expect, it, vi } from 'vitest';

const {
	mockEnv,
	mockHandleCallback,
	mockShouldIncludeErrorMessage,
	mockAuthKit
} = vi.hoisted(() => ({
	mockEnv: {
		WORKOS_CLIENT_ID: 'client_123',
		WORKOS_API_KEY: 'sk_test_123',
		WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
		WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
		ORIGIN: 'https://kaivalo.test'
	} as Record<string, string>,
	mockHandleCallback: vi.fn(),
	mockShouldIncludeErrorMessage: vi.fn(() => false),
	mockAuthKit: {
		handleCallback: vi.fn()
	}
}));

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

vi.mock('@workos/authkit-sveltekit', () => ({
	authKit: mockAuthKit
}));

vi.mock('$lib/server/error-diagnostics.js', async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		shouldIncludeErrorMessage: mockShouldIncludeErrorMessage
	};
});

describe('auth callback route', () => {
	it('uses the AuthKit callback handler response', async () => {
		vi.resetModules();
		const upstreamResponse = Response.redirect(
			'https://kaivalo.test/account?from=auth',
			302
		);
		mockHandleCallback.mockResolvedValueOnce(upstreamResponse);
		mockAuthKit.handleCallback.mockReturnValueOnce(mockHandleCallback);

		const { GET } = await import('./+server');
		const event = {
			request: new Request('https://kaivalo.test/auth/callback'),
			url: new URL('https://kaivalo.test/auth/callback')
		} as never;

		const response = await GET(event);

		expect(mockAuthKit.handleCallback).toHaveBeenCalledOnce();
		expect(mockHandleCallback).toHaveBeenCalledWith(event);
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/account?from=auth');
	});
});
