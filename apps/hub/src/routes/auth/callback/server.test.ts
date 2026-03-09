import { error, redirect, type Handle } from '@sveltejs/kit';
import type { User } from '@workos/authkit-sveltekit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	AUTH_ERROR_QUERY_NAME,
	AUTH_ERROR_QUERY_VALUE,
	AUTH_ERROR_TIMESTAMP_QUERY_NAME,
	readVerifiedAuthError
} from '$lib/auth/auth-error-query.ts';

const SESSION_COOKIE_NAME = 'wos_session';
const SESSION_COOKIE_PAIR = `${SESSION_COOKIE_NAME}=callback-session`;
const AUTHENTICATED_USER: User = {
	object: 'user',
	id: 'user_123',
	firstName: 'Kai',
	email: 'kai@example.com',
	emailVerified: true,
	profilePictureUrl: 'https://avatars.githubusercontent.com/u/1',
	lastName: null,
	lastSignInAt: '2026-03-09T12:00:00.000Z',
	locale: 'en',
	createdAt: '2026-03-01T12:00:00.000Z',
	updatedAt: '2026-03-09T12:00:00.000Z',
	externalId: null,
	metadata: {}
};

const { mockConfigureAuthKit, mockEnv, mockGetUser, mockHandleCallback } =
	vi.hoisted(() => ({
		mockConfigureAuthKit: vi.fn(),
		mockEnv: {
			WORKOS_CLIENT_ID: 'client_123',
			WORKOS_API_KEY: 'sk_test_123',
			WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
			WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
			AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
			ORIGIN: 'https://kaivalo.test',
			NODE_ENV: 'production'
		} as Record<string, string>,
		mockGetUser: vi.fn(async (event) => event.locals.auth?.user ?? null),
		mockHandleCallback: vi.fn()
	}));

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

vi.mock('@workos/authkit-sveltekit', () => ({
	configureAuthKit: mockConfigureAuthKit,
	authKitHandle:
		(): Handle =>
		async ({ event, resolve }) => {
			const cookieHeader = event.request.headers.get('cookie') ?? '';
			event.locals.auth = {
				user: cookieHeader.includes(SESSION_COOKIE_PAIR)
					? AUTHENTICATED_USER
					: null
			};
			return resolve(event);
		},
	authKit: {
		getUser: mockGetUser,
		handleCallback: mockHandleCallback
	}
}));

function createEvent(
	headers: HeadersInit = {},
	requestUrl = 'https://kaivalo.test/auth/callback'
) {
	return {
		request: new Request(requestUrl, {
			headers
		}),
		url: new URL(requestUrl)
	} as never;
}

describe('auth callback route', () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.resetModules();
		mockConfigureAuthKit.mockReset();
		mockGetUser.mockClear();
		mockHandleCallback.mockReset();
		delete mockEnv.TRUST_X_FORWARDED_PROTO;
		delete mockEnv.TRUSTED_PROXY_IPS;
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		errorSpy.mockRestore();
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

	it('normalizes successful shell callback redirects to the launcher route', async () => {
		mockHandleCallback.mockReturnValue(async () =>
			Response.redirect('https://kaivalo.test/services', 303)
		);

		const { GET } = await import('./+server');
		const response = await GET(createEvent());

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/services');
		expect(mockHandleCallback).toHaveBeenCalledOnce();
	});

	it('preserves launcher query parameters on successful shell callback redirects', async () => {
		mockHandleCallback.mockReturnValue(async () =>
			Response.redirect('https://kaivalo.test/services?welcome=1', 303)
		);

		const { GET } = await import('./+server');
		const response = await GET(createEvent());

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/services?welcome=1');
		expect(mockHandleCallback).toHaveBeenCalledOnce();
	});

	it('normalizes callback redirects against the configured origin when the request host is poisoned', async () => {
		mockHandleCallback.mockReturnValue(async () =>
			Response.redirect('https://kaivalo.test/services', 303)
		);

		const { GET } = await import('./+server');
		const response = await GET(
			createEvent({}, 'https://attacker.test/auth/callback')
		);

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/services');
		expect(mockHandleCallback).toHaveBeenCalledOnce();
	});

	it('rejects callback redirects that point at the poisoned request host instead of the configured origin', async () => {
		mockHandleCallback.mockReturnValue(async () =>
			Response.redirect('https://attacker.test/services', 303)
		);

		const { GET } = await import('./+server');
		await expect(
			GET(
				createEvent(
					{
						accept: 'application/json'
					},
					'https://attacker.test/auth/callback'
				)
			)
		).rejects.toMatchObject({
			status: 503,
			body: {
				message: expect.stringMatching(
					/^Auth callback failed\. Reference: authcb_/
				)
			}
		});
		expect(mockHandleCallback).toHaveBeenCalledOnce();
	});

	it('normalizes thrown redirects against the configured origin at the route boundary', async () => {
		mockHandleCallback.mockReturnValue(async () => {
			throw redirect(303, 'https://kaivalo.test/services?welcome=1');
		});

		const { GET } = await import('./+server');

		await expect(
			GET(createEvent({}, 'https://attacker.test/auth/callback'))
		).rejects.toMatchObject({
			status: 303,
			location: '/services?welcome=1'
		});
	});

	it('passes through upstream http errors from the route boundary', async () => {
		mockHandleCallback.mockReturnValue(async () => {
			throw error(429, 'Too many attempts');
		});

		const { GET } = await import('./+server');

		await expect(GET(createEvent())).rejects.toMatchObject({
			status: 429,
			body: {
				message: 'Too many attempts'
			}
		});
	});

	it('normalizes redirect-like objects through the real route entrypoint', async () => {
		mockHandleCallback.mockReturnValue(async () => {
			throw {
				status: 303,
				location: 'https://kaivalo.test/services#shell'
			};
		});

		const { GET } = await import('./+server');

		await expect(
			GET(createEvent({}, 'https://attacker.test/auth/callback'))
		).rejects.toMatchObject({
			status: 303,
			location: '/services#shell'
		});
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
					secret: mockEnv.AUTH_ERROR_SIGNING_SECRET,
					now: Number(
						location.searchParams.get(AUTH_ERROR_TIMESTAMP_QUERY_NAME)
					)
				})
			).toEqual({
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: expect.stringMatching(/^authcb_/)
			});
			expect(errorSpy).toHaveBeenCalledWith(
				'Auth callback failed',
				expect.objectContaining({
					errorCode: 'AUTH_CALLBACK_UNEXPECTED_FAILURE',
					errorName: 'Error',
					method: 'GET',
					pathname: '/auth/callback',
					requestId: 'missing',
					incidentId: expect.stringMatching(/^authcb_/)
				})
			);
		}
	});

	it('establishes a session that unlocks the protected services launcher', async () => {
		mockHandleCallback.mockReturnValue(async () => {
			const headers = new Headers();
			headers.set('location', 'https://kaivalo.test/services?welcome=1');
			headers.set(
				'set-cookie',
				`${SESSION_COOKIE_PAIR}; Path=/; HttpOnly; Secure; SameSite=Lax`
			);
			return new Response(null, {
				status: 302,
				headers
			});
		});

		const { GET } = await import('./+server');
		const { authKitHandle } = await import('@workos/authkit-sveltekit');
		const { load: loadLayout } = await import('../../+layout.server');
		const { load: loadServices } = await import('../../services/+page.server');

		const callbackResponse = await GET(
			createEvent(
				{
					accept: 'text/html',
					'sec-fetch-mode': 'navigate'
				},
				'https://kaivalo.test/auth/callback?code=valid-code&state=valid-state'
			)
		);

		expect(callbackResponse.status).toBe(302);
		expect(callbackResponse.headers.get('location')).toBe(
			'/services?welcome=1'
		);
		expect(callbackResponse.headers.get('set-cookie')).toContain(
			SESSION_COOKIE_PAIR
		);

		const servicesRequest = new Request('https://kaivalo.test/services', {
			headers: {
				accept: 'text/html',
				cookie: SESSION_COOKIE_PAIR
			}
		});
		const servicesEvent = {
			locals: {},
			request: servicesRequest,
			url: new URL(servicesRequest.url)
		} as never;

		await authKitHandle()({
			event: servicesEvent,
			resolve: () =>
				new Response('<html></html>', {
					headers: {
						'content-type': 'text/html; charset=utf-8'
					}
				})
		});

		const layoutData = await loadLayout(servicesEvent);
		const servicesData = (await loadServices({
			parent: async () => layoutData
		} as never)) as {
			activeServices: Array<{ id: string }>;
			plannedServices: Array<{ id: string }>;
		};

		expect(mockGetUser).toHaveBeenCalledOnce();
		expect(layoutData).toEqual({
			user: {
				firstName: 'Kai',
				email: 'kai@example.com',
				profilePictureUrl:
					'/avatar?source=https%3A%2F%2Favatars.githubusercontent.com%2Fu%2F1'
			},
			signInUrl: null,
			authError: null
		});
		expect(servicesData.activeServices.map((service) => service.id)).toEqual([
			'sweep'
		]);
		expect(servicesData.plannedServices.map((service) => service.id)).toEqual([
			'podstudio'
		]);
	});
});
