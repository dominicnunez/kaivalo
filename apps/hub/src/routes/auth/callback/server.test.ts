import { describe, expect, it, vi } from 'vitest';
import { error, redirect } from '@sveltejs/kit';

const {
	mockEnv,
	mockShouldIncludeErrorMessage,
	mockHandleCallback,
	mockGetHandler,
	mockCreateAuthCallbackGetHandler
} = vi.hoisted(() => ({
	mockEnv: {
		WORKOS_CLIENT_ID: 'client_123',
		WORKOS_API_KEY: 'sk_test_123',
		WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
		WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
		ORIGIN: 'https://kaivalo.test'
	} as Record<string, string>,
	mockShouldIncludeErrorMessage: vi.fn(() => true),
	mockHandleCallback: vi.fn(),
	mockGetHandler: vi.fn(),
	mockCreateAuthCallbackGetHandler: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

vi.mock('@workos/authkit-sveltekit', () => ({
	authKit: {
		handleCallback: mockHandleCallback
	}
}));

vi.mock('$lib/server/error-diagnostics.js', () => ({
	shouldIncludeErrorMessage: mockShouldIncludeErrorMessage
}));

vi.mock('$lib/auth/callback-handler.js', () => ({
	createAuthCallbackGetHandler: mockCreateAuthCallbackGetHandler
}));

function captureThrown(factory: () => unknown) {
	try {
		factory();
		throw new Error('expected factory to throw');
	} catch (thrown) {
		return thrown;
	}
}

describe('auth callback route', () => {
	it('configures the callback handler from env and delegates GET requests', async () => {
		vi.resetModules();
		mockCreateAuthCallbackGetHandler.mockReturnValueOnce(mockGetHandler);
		mockGetHandler.mockResolvedValueOnce(new Response(null, { status: 204 }));
		const upstreamHandler = vi.fn();
		mockHandleCallback.mockReturnValueOnce(upstreamHandler);

		const { GET } = await import('./+server');
		const event = {
			request: new Request('https://kaivalo.test/auth/callback'),
			url: new URL('https://kaivalo.test/auth/callback')
		} as never;

		const response = await GET(event);

		expect(response.status).toBe(204);
		expect(mockCreateAuthCallbackGetHandler).toHaveBeenCalledOnce();
		const options = mockCreateAuthCallbackGetHandler.mock.calls[0][0];
		expect(options.cookiePassword).toBe(mockEnv.WORKOS_COOKIE_PASSWORD);
		expect(options.includeMessageInLogs).toBe(true);
		expect(options.handleCallback()).toBe(upstreamHandler);
		expect(
			options.isRedirect(captureThrown(() => redirect(303, '/done')))
		).toBe(true);
		expect(
			options.isHttpError(captureThrown(() => error(400, 'bad request')))
		).toBe(true);
		expect(mockShouldIncludeErrorMessage).toHaveBeenCalledWith(mockEnv);
		expect(mockGetHandler).toHaveBeenCalledWith(event);
	});
});
