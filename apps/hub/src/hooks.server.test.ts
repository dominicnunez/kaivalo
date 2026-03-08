import { beforeEach, describe, expect, it, vi } from 'vitest';

type HookInput = {
	event: unknown;
	resolve: (event: unknown) => Promise<Response>;
};

const configureAuthKit = vi.fn();
const authKitHandle = vi.fn(
	() =>
		async ({ event, resolve }: HookInput) =>
			resolve(event)
);
const privateEnv: Record<string, string> = {};

vi.mock('@workos/authkit-sveltekit', () => ({
	configureAuthKit,
	authKitHandle
}));

vi.mock('$env/dynamic/private', () => ({
	env: privateEnv
}));

vi.mock('@sveltejs/kit/hooks', () => ({
	sequence:
		(...handles: Array<(input: HookInput) => Promise<Response>>) =>
		async ({ event, resolve }: HookInput) => {
			const run = async (
				index: number,
				currentEvent: unknown
			): Promise<Response> => {
				const current = handles[index];
				if (!current) {
					return resolve(currentEvent);
				}
				return current({
					event: currentEvent,
					resolve: (nextEvent: unknown) => run(index + 1, nextEvent)
				});
			};
			return run(0, event);
		}
}));

function setRequiredWorkosEnv() {
	privateEnv.NODE_ENV = 'test';
	privateEnv.WORKOS_CLIENT_ID = 'client_test';
	privateEnv.WORKOS_API_KEY = 'sk_test';
	privateEnv.WORKOS_REDIRECT_URI = 'https://kaivalo.test/auth/callback';
	privateEnv.WORKOS_COOKIE_PASSWORD = 'ab'.repeat(32);
	privateEnv.ORIGIN = 'https://kaivalo.test';
}

function createEvent(url: string, headers: HeadersInit = {}) {
	return {
		request: new Request(url, { headers }),
		url: new URL(url),
		getClientAddress: () => '203.0.113.1'
	};
}

describe('hooks server behavior', () => {
	beforeEach(() => {
		vi.resetModules();
		for (const key of Object.keys(privateEnv)) {
			delete privateEnv[key];
		}
		configureAuthKit.mockClear();
		authKitHandle.mockClear();
		setRequiredWorkosEnv();
	});

	it('keeps auth route documents private and no-store for cookie-bearing requests', async () => {
		const { handle } = await import('./hooks.server');
		const response = await handle({
			event: createEvent('https://kaivalo.test/auth/callback', {
				cookie: 'sid=abc123'
			}) as never,
			resolve: async () =>
				new Response('<html></html>', {
					headers: { 'Content-Type': 'text/html' }
				})
		});

		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('strict-transport-security')).toContain(
			'max-age='
		);
		expect(response.headers.get('x-frame-options')).toBe('DENY');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(configureAuthKit).toHaveBeenCalledTimes(1);
		expect(authKitHandle).toHaveBeenCalledTimes(1);
	});

	it('applies reusable caching for public html responses without auth context', async () => {
		const { handle } = await import('./hooks.server');
		const response = await handle({
			event: createEvent('https://kaivalo.test/') as never,
			resolve: async () =>
				new Response('<html></html>', {
					headers: { 'Content-Type': 'text/html' }
				})
		});

		expect(response.headers.get('cache-control')).toBe(
			'public, max-age=300, stale-while-revalidate=60'
		);
		expect(response.headers.get('vary')).toBeNull();
	});

	it('keeps non-success html responses private even without auth headers', async () => {
		const { handle } = await import('./hooks.server');
		const response = await handle({
			event: createEvent('https://kaivalo.test/missing') as never,
			resolve: async () =>
				new Response('<html>not found</html>', {
					status: 404,
					headers: { 'Content-Type': 'text/html' }
				})
		});

		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('vary')).toBeNull();
	});

	it('lets unexpected downstream failures propagate to the framework error path', async () => {
		const { handle } = await import('./hooks.server');

		await expect(
			handle({
				event: createEvent('https://kaivalo.test/broken') as never,
				resolve: async () => {
					throw new Error('unexpected downstream failure');
				}
			})
		).rejects.toThrow('unexpected downstream failure');
	});

	it('returns sanitized error payload with an incident id from handleError', async () => {
		const errorSpy = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const { handleError } = await import('./hooks.server');
		const cause = Object.assign(
			new Error('oauth code=secret-code should not leak'),
			{
				code: 'UPSTREAM_TIMEOUT'
			}
		);

		const result = handleError({
			error: Object.assign(
				new Error('request failed with token=super-secret'),
				{
					code: 'WORKOS_FETCH_FAILED',
					cause
				}
			),
			status: 500,
			message: 'ignored',
			event: createEvent('https://kaivalo.test/broken', {
				'x-request-id': 'bad request id + trace'
			}) as never
		});

		expect(result).toEqual({
			message: 'An unexpected error occurred. Please try again.',
			incidentId: expect.stringMatching(/^hook_/)
		});
		expect(errorSpy).toHaveBeenCalledWith(
			'Unhandled request error',
			expect.objectContaining({
				errorCode: 'HOOK_UNEXPECTED_FAILURE',
				errorUpstreamCode: 'WORKOS_FETCH_FAILED',
				errorCauseCode: 'UPSTREAM_TIMEOUT',
				errorCauseName: 'Error',
				errorMessage: 'request failed with token=[redacted]',
				errorCauseMessage: 'oauth code=[redacted] should not leak',
				pathname: '/broken',
				requestId: 'bad_request_id___trace'
			})
		);
		errorSpy.mockRestore();
	});

	it('fails import at startup when required WorkOS environment is missing', async () => {
		vi.resetModules();
		setRequiredWorkosEnv();
		privateEnv.WORKOS_API_KEY = '';

		await expect(import('./hooks.server')).rejects.toThrow(
			/Missing required environment variable: WORKOS_API_KEY/
		);
	});
});
