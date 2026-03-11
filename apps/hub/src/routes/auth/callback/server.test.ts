import { type Handle } from '@sveltejs/kit';
import type { User } from '@workos/authkit-sveltekit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	AUTH_ERROR_INCIDENT_QUERY_NAME,
	AUTH_ERROR_QUERY_NAME,
	AUTH_ERROR_QUERY_VALUE,
	AUTH_ERROR_SIGNATURE_QUERY_NAME,
	AUTH_ERROR_TIMESTAMP_QUERY_NAME,
	readVerifiedAuthError
} from '$lib/auth/auth-error-query.ts';
import { AUTHKIT_COOKIE_NAME } from '$lib/server/authkit-config.ts';

const SESSION_COOKIE_PAIR = `${AUTHKIT_COOKIE_NAME}=callback-session`;
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
	beforeEach(() => {
		vi.resetModules();
		mockConfigureAuthKit.mockReset();
		mockGetUser.mockClear();
		mockHandleCallback.mockReset();
		mockEnv.WORKOS_CLIENT_ID = 'client_123';
		mockEnv.WORKOS_API_KEY = 'sk_test_123';
		mockEnv.WORKOS_REDIRECT_URI = 'https://kaivalo.test/auth/callback';
		mockEnv.WORKOS_COOKIE_PASSWORD = 'ab'.repeat(32);
		mockEnv.AUTH_ERROR_SIGNING_SECRET = 'cd'.repeat(32);
		mockEnv.ORIGIN = 'https://kaivalo.test';
		mockEnv.NODE_ENV = 'production';
		delete mockEnv.TRUST_X_FORWARDED_PROTO;
		delete mockEnv.TRUSTED_PROXY_IPS;
	});

	afterEach(() => {
		vi.restoreAllMocks();
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
			location: 'https://kaivalo.test/services#shell'
		});
		expect(mockHandleCallback).toHaveBeenCalledOnce();
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

	it('translates vendor auth error redirects into the signed landing-page error flow', async () => {
		mockHandleCallback.mockReturnValue(async () => {
			throw {
				status: 302,
				location: 'https://kaivalo.test/auth/error?code=AUTH_FAILED'
			};
		});

		const { GET } = await import('./+server');

		try {
			await GET(
				createEvent(
					{
						accept: 'text/html',
						'sec-fetch-mode': 'navigate'
					},
					'https://kaivalo.test/auth/callback?code=test-code&state=test-state'
				)
			);
			throw new Error('expected callback route to redirect');
		} catch (caught) {
			const redirectLike = caught as { status: number; location: string };
			expect(redirectLike).toMatchObject({
				status: 303
			});
			const location = new URL(redirectLike.location, 'https://kaivalo.test');
			expect(location.pathname).toBe('/');
			expect(location.searchParams.get(AUTH_ERROR_QUERY_NAME)).toBe(
				AUTH_ERROR_QUERY_VALUE
			);
			expect(
				location.searchParams.get(AUTH_ERROR_INCIDENT_QUERY_NAME) ?? ''
			).toMatch(/^authcb_[0-9a-f-]+$/);
			expect(location.searchParams.has(AUTH_ERROR_TIMESTAMP_QUERY_NAME)).toBe(
				true
			);
			expect(location.searchParams.has(AUTH_ERROR_SIGNATURE_QUERY_NAME)).toBe(
				true
			);
			expect(
				readVerifiedAuthError(location.searchParams, {
					secret: mockEnv.AUTH_ERROR_SIGNING_SECRET,
					now:
						Number(location.searchParams.get(AUTH_ERROR_TIMESTAMP_QUERY_NAME)) +
						1
				})
			).toEqual({
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: location.searchParams.get(AUTH_ERROR_INCIDENT_QUERY_NAME)
			});
		}
	});

	it('fails fast when the callback route is initialized without required auth env', async () => {
		delete mockEnv.WORKOS_CLIENT_ID;

		const { GET } = await import('./+server');

		expect(() => GET(createEvent())).toThrow(
			/Missing required environment variable: WORKOS_CLIENT_ID/
		);
		expect(mockHandleCallback).not.toHaveBeenCalled();
	});

	it('returns a 503 error for non-browser callback factory failures', async () => {
		const errorSpy = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		mockHandleCallback.mockImplementation(() => {
			throw new Error('upstream unavailable');
		});

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
				message: expect.stringMatching(
					/^Auth callback failed\. Reference: authcb_/
				)
			}
		});
		expect(errorSpy).toHaveBeenCalledOnce();
		expect(errorSpy).toHaveBeenCalledWith(
			'Auth callback failed',
			expect.objectContaining({
				errorCode: 'AUTH_CALLBACK_UNEXPECTED_FAILURE',
				pathname: '/auth/callback',
				method: 'GET',
				incidentId: expect.stringMatching(/^authcb_/),
				errorName: 'Error'
			})
		);
	});

	it('treats redirect responses without a location header as route failures', async () => {
		mockEnv.NODE_ENV = 'development';
		const errorSpy = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		mockHandleCallback.mockReturnValue(
			async () =>
				new Response(null, {
					status: 302
				})
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
				message: expect.stringMatching(
					/^Auth callback failed\. Reference: authcb_/
				)
			}
		});
		expect(errorSpy).toHaveBeenCalledWith(
			'Auth callback failed',
			expect.objectContaining({
				errorCode: 'AUTH_CALLBACK_UNEXPECTED_FAILURE',
				errorMessage:
					'Auth callback produced a redirect response without a location header'
			})
		);
	});

	it('treats invalid redirect responses as route failures', async () => {
		mockEnv.NODE_ENV = 'development';
		const errorSpy = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		mockHandleCallback.mockReturnValue(async () =>
			Response.redirect('https://evil.example/auth/callback', 302)
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
				message: expect.stringMatching(
					/^Auth callback failed\. Reference: authcb_/
				)
			}
		});
		expect(errorSpy).toHaveBeenCalledWith(
			'Auth callback failed',
			expect.objectContaining({
				errorCode: 'AUTH_CALLBACK_UNEXPECTED_FAILURE',
				errorMessage: 'Auth callback produced an invalid redirect location'
			})
		);
	});
});
