// @vitest-environment node

import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi
} from 'vitest';
import {
	AUTH_ERROR_INCIDENT_QUERY_NAME,
	AUTH_ERROR_TIMESTAMP_QUERY_NAME,
	readVerifiedAuthError
} from '../../../lib/auth/auth-error-query.ts';
import { AUTHKIT_COOKIE_NAME } from '$lib/server/authkit-config.ts';
import { readVerifiedAvatarProxySource } from '$lib/server/avatar-url.ts';
import {
	assertSessionCookieContract,
	getSetCookieHeaders
} from '../../../../../../tests/helpers/session-cookie.ts';
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';

const WORKOS_AUTHENTICATE_URL =
	'https://api.workos.com/user_management/authenticate';
const WORKOS_JWKS_URL = 'https://api.workos.com/sso/jwks/client_123';
const SESSION_ID = 'session_123';
const AUTHENTICATED_USER_RESPONSE = {
	object: 'user',
	id: 'user_123',
	email: 'kai@example.com',
	email_verified: true,
	first_name: 'Kai',
	profile_picture_url: 'https://avatars.githubusercontent.com/u/1',
	last_name: null,
	last_sign_in_at: '2026-03-09T12:00:00.000Z',
	locale: 'en',
	created_at: '2026-03-01T12:00:00.000Z',
	updated_at: '2026-03-09T12:00:00.000Z',
	external_id: null,
	metadata: {}
} as const;

const { mockEnv } = vi.hoisted(() => ({
	mockEnv: {
		WORKOS_CLIENT_ID: 'client_123',
		WORKOS_API_KEY: 'sk_test_123',
		WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
		WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
		AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
		AVATAR_PROXY_SIGNING_SECRET: 'ef'.repeat(32),
		ORIGIN: 'https://kaivalo.test',
		NODE_ENV: 'production'
	} as Record<string, string>
}));

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

let signingKey: KeyObject;
let publicJwk: Record<string, unknown>;

type ServicesEventLocals = {
	auth?: {
		sessionId: string;
		user: {
			email: string;
			firstName: string | null;
		};
	};
};

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

function readLayoutAvatarProfilePictureUrl(layoutData: unknown): string | null {
	const record = layoutData as {
		user?: {
			profilePictureUrl?: string | null;
		} | null;
	};

	return record.user?.profilePictureUrl ?? null;
}

function buildReturnToState(returnPathname: string): string {
	return Buffer.from(JSON.stringify({ returnPathname }), 'utf8').toString(
		'base64url'
	);
}

async function createAccessToken(): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const header = Buffer.from(
		JSON.stringify({
			alg: 'RS256',
			kid: String(publicJwk.kid),
			typ: 'JWT'
		}),
		'utf8'
	).toString('base64url');
	const payload = Buffer.from(
		JSON.stringify({
			sid: SESSION_ID,
			sub: AUTHENTICATED_USER_RESPONSE.id,
			iat: now,
			exp: now + 60 * 60
		}),
		'utf8'
	).toString('base64url');
	const signingInput = `${header}.${payload}`;
	const signer = createSign('RSA-SHA256');
	signer.update(signingInput);
	signer.end();

	return `${signingInput}.${signer.sign(signingKey).toString('base64url')}`;
}

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: {
			'content-type': 'application/json'
		}
	});
}

beforeAll(async () => {
	const { privateKey, publicKey } = generateKeyPairSync('rsa', {
		modulusLength: 2048
	});
	signingKey = privateKey;
	publicJwk = publicKey.export({
		format: 'jwk'
	}) as JsonWebKey & Record<string, unknown>;
	publicJwk.alg = 'RS256';
	publicJwk.kid = 'callback-test-key';
	publicJwk.use = 'sig';
});

describe('auth callback success path', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.unstubAllGlobals();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('creates the real session cookie and unlocks the services shell', async () => {
		const accessToken = await createAccessToken();
		const fetchSpy = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const request =
					input instanceof Request ? input : new Request(String(input), init);
				const requestUrl = request.url;

				if (requestUrl === WORKOS_AUTHENTICATE_URL) {
					expect(request.method).toBe('POST');
					expect(await request.json()).toMatchObject({
						grant_type: 'authorization_code',
						client_id: mockEnv.WORKOS_CLIENT_ID,
						client_secret: mockEnv.WORKOS_API_KEY,
						code: 'valid-code'
					});

					return jsonResponse({
						access_token: accessToken,
						refresh_token: 'refresh_token_123',
						user: AUTHENTICATED_USER_RESPONSE
					});
				}

				if (requestUrl === WORKOS_JWKS_URL) {
					return jsonResponse({
						keys: [publicJwk]
					});
				}

				throw new Error(
					`Unexpected fetch request: ${request.method} ${requestUrl}`
				);
			}
		);
		vi.stubGlobal('fetch', fetchSpy);

		const { configureAuthKit, authKitHandle } =
			await import('@workos/authkit-sveltekit');
		configureAuthKit({
			clientId: mockEnv.WORKOS_CLIENT_ID,
			apiKey: mockEnv.WORKOS_API_KEY,
			redirectUri: mockEnv.WORKOS_REDIRECT_URI,
			cookiePassword: mockEnv.WORKOS_COOKIE_PASSWORD,
			cookieName: AUTHKIT_COOKIE_NAME
		});

		const { GET } = await import('./+server');
		const { load: loadLayout } = await import('../../+layout.server');
		const { load: loadServices } = await import('../../services/+page.server');

		const callbackResponse = await GET(
			createEvent(
				{
					accept: 'text/html',
					'sec-fetch-mode': 'navigate'
				},
				`https://kaivalo.test/auth/callback?code=valid-code&state=${buildReturnToState('/services?welcome=1')}`
			)
		);

		expect(callbackResponse.status).toBe(302);
		expect(callbackResponse.headers.get('location')).toBe(
			'/services?welcome=1'
		);

		const sessionCookie = assertSessionCookieContract(callbackResponse.headers);
		const servicesRequest = new Request('https://kaivalo.test/services', {
			headers: {
				accept: 'text/html',
				cookie: sessionCookie
			}
		});
		const servicesEvent = {
			locals: {} as ServicesEventLocals,
			request: servicesRequest,
			url: new URL(servicesRequest.url)
		};

		await authKitHandle()({
			event: servicesEvent as never,
			resolve: () =>
				Promise.resolve(
					new Response('<html></html>', {
						headers: {
							'content-type': 'text/html; charset=utf-8'
						}
					})
				)
		});

		expect(servicesEvent.locals.auth).toMatchObject({
			sessionId: SESSION_ID,
			user: {
				email: AUTHENTICATED_USER_RESPONSE.email,
				firstName: AUTHENTICATED_USER_RESPONSE.first_name
			}
		});

		const layoutData = await loadLayout(
			servicesEvent as Parameters<typeof loadLayout>[0]
		);
		const servicesData = (await loadServices({
			parent: async () => layoutData
		} as Parameters<typeof loadServices>[0])) as {
			activeServices: Array<{ id: string }>;
			plannedServices: Array<{ id: string }>;
		};

		expect(layoutData).toMatchObject({
			user: {
				firstName: 'Kai',
				email: 'kai@example.com'
			},
			signInUrl: null,
			authError: null
		});
		expect(
			readVerifiedAvatarProxySource(
				new URL(
					readLayoutAvatarProfilePictureUrl(layoutData) ?? '',
					'https://kaivalo.test'
				).searchParams,
				{
					secret: mockEnv.AVATAR_PROXY_SIGNING_SECRET,
					now: Date.now()
				}
			)
		).toBe('https://avatars.githubusercontent.com/u/1');
		expect(
			readVerifiedAvatarProxySource(
				new URL(
					readLayoutAvatarProfilePictureUrl(layoutData) ?? '',
					'https://kaivalo.test'
				).searchParams,
				{
					secret: mockEnv.AUTH_ERROR_SIGNING_SECRET,
					now: Date.now()
				}
			)
		).toBeNull();
		expect(servicesData.activeServices.map((service) => service.id)).toEqual([
			'sweep'
		]);
		expect(servicesData.plannedServices.map((service) => service.id)).toEqual([
			'podstudio'
		]);
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});

	it('rejects hostile return targets in the real callback route', async () => {
		const accessToken = await createAccessToken();
		const fetchSpy = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const request =
					input instanceof Request ? input : new Request(String(input), init);
				const requestUrl = request.url;

				if (requestUrl === WORKOS_AUTHENTICATE_URL) {
					expect(request.method).toBe('POST');
					expect(await request.json()).toMatchObject({
						grant_type: 'authorization_code',
						client_id: mockEnv.WORKOS_CLIENT_ID,
						client_secret: mockEnv.WORKOS_API_KEY,
						code: 'valid-code'
					});

					return jsonResponse({
						access_token: accessToken,
						refresh_token: 'refresh_token_123',
						user: AUTHENTICATED_USER_RESPONSE
					});
				}

				if (requestUrl === WORKOS_JWKS_URL) {
					return jsonResponse({
						keys: [publicJwk]
					});
				}

				throw new Error(
					`Unexpected fetch request: ${request.method} ${requestUrl}`
				);
			}
		);
		vi.stubGlobal('fetch', fetchSpy);

		const { authKit, configureAuthKit } =
			await import('@workos/authkit-sveltekit');
		configureAuthKit({
			clientId: mockEnv.WORKOS_CLIENT_ID,
			apiKey: mockEnv.WORKOS_API_KEY,
			redirectUri: mockEnv.WORKOS_REDIRECT_URI,
			cookiePassword: mockEnv.WORKOS_COOKIE_PASSWORD,
			cookieName: AUTHKIT_COOKIE_NAME
		});

		const { GET } = await import('./+server');
		const callbackUrl = `https://kaivalo.test/auth/callback?code=valid-code&state=${buildReturnToState('https://evil.example.test/phish')}`;
		const upstreamResponse = await authKit.handleCallback()(
			createEvent(
				{
					accept: 'text/html',
					'sec-fetch-mode': 'navigate'
				},
				callbackUrl
			)
		);

		expect(upstreamResponse.status).toBe(302);
		expect(upstreamResponse.headers.get('location')).toBe(
			'https://evil.example.test/phish'
		);
		expect(getSetCookieHeaders(upstreamResponse.headers)).toHaveLength(1);

		try {
			await GET(
				createEvent(
					{
						accept: 'text/html',
						'sec-fetch-mode': 'navigate'
					},
					callbackUrl
				)
			);
			throw new Error('expected callback route to redirect');
		} catch (caught) {
			const redirectLike = caught as { status: number; location: string };
			expect(redirectLike).toMatchObject({
				status: 303,
				location: expect.stringMatching(/^https:\/\/kaivalo\.test\/\?/)
			});
			expect(redirectLike).not.toHaveProperty('headers');

			const location = new URL(redirectLike.location);
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
});
