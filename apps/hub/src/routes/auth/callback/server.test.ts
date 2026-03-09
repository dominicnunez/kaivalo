import { type Handle } from '@sveltejs/kit';
import type { User } from '@workos/authkit-sveltekit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
	beforeEach(() => {
		vi.resetModules();
		mockConfigureAuthKit.mockReset();
		mockGetUser.mockClear();
		mockHandleCallback.mockReset();
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
			location: '/services#shell'
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
});
