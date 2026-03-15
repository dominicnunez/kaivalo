import { redirect } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	AUTH_ERROR_QUERY_NAME,
	AUTH_ERROR_QUERY_VALUE,
	AUTH_ERROR_TIMESTAMP_QUERY_NAME,
	readVerifiedAuthError
} from '$lib/auth/auth-error-query.ts';

const { mockCreateConfiguredWorkosSignInStart, mockBeginSignIn, mockEnv } =
	vi.hoisted(() => ({
		mockCreateConfiguredWorkosSignInStart: vi.fn(),
		mockBeginSignIn: vi.fn(),
		mockEnv: {
			WORKOS_CLIENT_ID: 'client_123',
			WORKOS_API_KEY: 'sk_test_123',
			WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
			WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
			AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
			AVATAR_PROXY_SIGNING_SECRET: 'ef'.repeat(32),
			WORKOS_API_HOSTNAME: 'auth.kaivalo-login.com',
			ORIGIN: 'https://kaivalo.test',
			NODE_ENV: 'production'
		} as Record<string, string>
	}));

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

vi.mock('$lib/server/workos-auth.ts', () => ({
	createConfiguredWorkosSignInStart: mockCreateConfiguredWorkosSignInStart
}));

const WORKOS_CALLBACK_STATE_COOKIE_NAME = '__Secure-wos_callback_state';

function createEvent(
	headers: HeadersInit = {},
	requestUrl = 'https://kaivalo.test/auth/sign-in'
) {
	return {
		request: new Request(requestUrl, {
			headers
		}),
		url: new URL(requestUrl)
	} as never;
}

function buildReturnToState(returnPathname: string): string {
	return Buffer.from(JSON.stringify({ returnPathname }), 'utf8').toString(
		'base64url'
	);
}

function parseSetCookieAttributes(
	setCookieHeader: string
): Map<string, string> {
	return new Map(
		setCookieHeader
			.split(';')
			.slice(1)
			.map((entry) => entry.trim())
			.filter(Boolean)
			.map((entry) => {
				const separatorIndex = entry.indexOf('=');
				if (separatorIndex < 0) {
					return [entry.toLowerCase(), ''];
				}

				return [
					entry.slice(0, separatorIndex).toLowerCase(),
					entry.slice(separatorIndex + 1)
				];
			})
	);
}

function readNonceCookie(response: Response): string {
	const cookieHeader =
		response.headers.get('set-cookie') ??
		response.headers.getSetCookie?.()[0] ??
		'';
	expect(cookieHeader).toMatch(
		new RegExp(`^${WORKOS_CALLBACK_STATE_COOKIE_NAME}=`)
	);
	const [nameValue] = cookieHeader.split(';');
	const separatorIndex = nameValue.indexOf('=');
	expect(separatorIndex).toBeGreaterThan(0);
	const attributes = parseSetCookieAttributes(cookieHeader);
	expect(attributes.get('path')).toBe('/auth/callback');
	expect(attributes.has('httponly')).toBe(true);
	expect(attributes.has('secure')).toBe(true);
	expect(attributes.get('samesite')?.toLowerCase()).toBe('lax');
	expect(attributes.get('max-age')).toBe('600');
	return nameValue.slice(separatorIndex + 1);
}

function readCustomStatePayload(location: string): string {
	const state = new URL(location).searchParams.get('state') ?? '';
	return state.includes('.') ? state.split('.').slice(1).join('.') : state;
}

describe('auth sign-in route', () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.resetModules();
		mockCreateConfiguredWorkosSignInStart.mockReset();
		mockBeginSignIn.mockReset();
		mockEnv.WORKOS_CLIENT_ID = 'client_123';
		mockEnv.WORKOS_API_KEY = 'sk_test_123';
		mockEnv.WORKOS_REDIRECT_URI = 'https://kaivalo.test/auth/callback';
		mockEnv.WORKOS_COOKIE_PASSWORD = 'ab'.repeat(32);
		mockEnv.AUTH_ERROR_SIGNING_SECRET = 'cd'.repeat(32);
		mockEnv.AVATAR_PROXY_SIGNING_SECRET = 'ef'.repeat(32);
		mockEnv.WORKOS_API_HOSTNAME = 'auth.kaivalo-login.com';
		mockEnv.ORIGIN = 'https://kaivalo.test';
		mockEnv.NODE_ENV = 'production';
		mockCreateConfiguredWorkosSignInStart.mockReturnValue(mockBeginSignIn);
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		errorSpy.mockRestore();
	});

	it('redirects to the trusted WorkOS sign-in URL', async () => {
		mockBeginSignIn.mockResolvedValue({
			location: `https://auth.kaivalo-login.com/user_management/authorize?screen_hint=sign-up&state=${buildReturnToState('/services')}.nonce-value`,
			headers: {
				'set-cookie':
					'__Secure-wos_callback_state=nonce-value; Path=/auth/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax'
			}
		} as never);

		const { GET } = await import('./+server');
		const response = await GET(createEvent());

		expect(response.status).toBe(303);
		const location = response.headers.get('location');
		expect(location).toMatch(
			/^https:\/\/auth\.kaivalo-login\.com\/user_management\/authorize\?/
		);
		expect(new URL(location ?? '').searchParams.get('screen_hint')).toBe(
			'sign-up'
		);
		expect(readCustomStatePayload(location ?? '')).toBe(
			readNonceCookie(response)
		);
		expect(mockBeginSignIn).toHaveBeenCalledWith({ returnTo: '/services' });
	});

	it('fails fast when the sign-in route is initialized without required auth env', async () => {
		delete mockEnv.WORKOS_CLIENT_ID;

		const { GET } = await import('./+server');

		expect(() => GET(createEvent())).toThrow(
			/Missing required environment variable: WORKOS_CLIENT_ID/
		);
		expect(mockBeginSignIn).not.toHaveBeenCalled();
	});

	it('normalizes trusted same-origin destinations that do not point back to the sign-in route', async () => {
		mockBeginSignIn.mockResolvedValue({
			location: 'https://kaivalo.test/services?welcome=1#hero',
			headers: {
				'set-cookie':
					'__Secure-wos_callback_state=nonce-value; Path=/auth/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax'
			}
		} as never);

		const { GET } = await import('./+server');
		const response = await GET(createEvent());

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/services?welcome=1#hero');
		expect(response.headers.get('set-cookie')).toContain(
			'__Secure-wos_callback_state=nonce-value'
		);
	});

	it('preserves trusted same-origin destinations as absolute URLs when the request host is poisoned', async () => {
		mockBeginSignIn.mockResolvedValue({
			location: 'https://kaivalo.test/services?welcome=1#hero',
			headers: {
				'set-cookie':
					'__Secure-wos_callback_state=nonce-value; Path=/auth/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax'
			}
		} as never);

		const { GET } = await import('./+server');
		const response = await GET(
			createEvent({}, 'https://attacker.test/auth/sign-in')
		);

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe(
			'https://kaivalo.test/services?welcome=1#hero'
		);
		expect(response.headers.get('set-cookie')).toContain(
			'__Secure-wos_callback_state=nonce-value'
		);
	});

	it('normalizes trusted redirect exceptions from upstream sign-in helpers', async () => {
		mockBeginSignIn.mockImplementation(async () => {
			throw redirect(307, 'https://kaivalo.test/services?welcome=1#hero');
		});

		const { GET } = await import('./+server');
		const response = await GET(createEvent());

		expect(response.status).toBe(307);
		expect(response.headers.get('location')).toBe('/services?welcome=1#hero');
		expect(response.headers.get('set-cookie')).toBeNull();
	});

	it('rejects redirect exceptions on untrusted origins', async () => {
		mockBeginSignIn.mockImplementation(async () => {
			throw redirect(307, 'https://evil.example/login');
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
				message: expect.stringMatching(/^Sign-in failed\. Reference: authsign_/)
			}
		});
		expect(errorSpy).toHaveBeenCalledOnce();
		expect(errorSpy).toHaveBeenLastCalledWith(
			expect.any(String),
			expect.objectContaining({
				errorCode: 'AUTH_SIGN_IN_UNEXPECTED_FAILURE',
				pathname: '/auth/sign-in',
				method: 'GET',
				incidentId: expect.stringMatching(/^authsign_/)
			})
		);
	});

	it('rejects same-origin sign-in destinations that loop back to the route itself', async () => {
		mockBeginSignIn.mockResolvedValue({
			location: 'https://kaivalo.test/auth/sign-in?screen_hint=sign-up#hero',
			headers: {
				'set-cookie':
					'__Secure-wos_callback_state=nonce-value; Path=/auth/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax'
			}
		} as never);

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
				message: expect.stringMatching(/^Sign-in failed\. Reference: authsign_/)
			}
		});
		expect(errorSpy).toHaveBeenCalledOnce();
		expect(errorSpy).toHaveBeenLastCalledWith(
			expect.any(String),
			expect.objectContaining({
				errorCode: 'AUTH_SIGN_IN_UNEXPECTED_FAILURE',
				pathname: '/auth/sign-in',
				method: 'GET',
				incidentId: expect.stringMatching(/^authsign_/)
			})
		);
	});

	it('rejects sign-in URLs on untrusted origins', async () => {
		mockBeginSignIn.mockResolvedValue({
			location: 'https://evil.example/login',
			headers: {
				'set-cookie':
					'__Secure-wos_callback_state=nonce-value; Path=/auth/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax'
			}
		} as never);

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
				message: expect.stringMatching(/^Sign-in failed\. Reference: authsign_/)
			}
		});
		expect(errorSpy).toHaveBeenCalledOnce();
		expect(errorSpy).toHaveBeenLastCalledWith(
			expect.any(String),
			expect.objectContaining({
				errorCode: 'AUTH_SIGN_IN_UNEXPECTED_FAILURE',
				pathname: '/auth/sign-in',
				method: 'GET',
				incidentId: expect.stringMatching(/^authsign_/)
			})
		);
	});

	it('redirects browser failures back to the landing page with a signed auth error', async () => {
		mockBeginSignIn.mockRejectedValue(new Error('upstream unavailable'));

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
				incidentId: expect.stringMatching(/^authsign_/)
			});
			expect(errorSpy).toHaveBeenCalledOnce();
			expect(errorSpy).toHaveBeenLastCalledWith(
				expect.any(String),
				expect.objectContaining({
					errorCode: 'AUTH_SIGN_IN_UNEXPECTED_FAILURE',
					pathname: '/auth/sign-in',
					method: 'GET',
					incidentId: expect.stringMatching(/^authsign_/)
				})
			);
		}
	});

	it('pins poisoned-host browser failures to the trusted landing-page origin', async () => {
		mockBeginSignIn.mockRejectedValue(new Error('upstream unavailable'));

		const { GET } = await import('./+server');

		try {
			await GET(
				createEvent(
					{
						accept: 'text/html',
						'sec-fetch-mode': 'navigate'
					},
					'https://attacker.test/auth/sign-in'
				)
			);
			throw new Error('expected GET to redirect');
		} catch (thrown) {
			expect(thrown).toMatchObject({
				status: 303,
				location: expect.stringMatching(/^https:\/\/kaivalo\.test\/\?/)
			});

			if (
				typeof thrown !== 'object' ||
				thrown === null ||
				!('location' in thrown) ||
				typeof thrown.location !== 'string'
			) {
				throw thrown;
			}

			const location = new URL(thrown.location);
			expect(location.origin).toBe(mockEnv.ORIGIN);
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
				incidentId: expect.stringMatching(/^authsign_/)
			});
			expect(errorSpy).toHaveBeenCalledOnce();
			expect(errorSpy).toHaveBeenLastCalledWith(
				expect.any(String),
				expect.objectContaining({
					errorCode: 'AUTH_SIGN_IN_UNEXPECTED_FAILURE',
					pathname: '/auth/sign-in',
					method: 'GET',
					incidentId: expect.stringMatching(/^authsign_/)
				})
			);
		}
	});

	it('treats sec-fetch-dest=document failures as browser navigations', async () => {
		mockBeginSignIn.mockRejectedValue(new Error('upstream unavailable'));

		const { GET } = await import('./+server');

		try {
			await GET(
				createEvent({
					accept: 'text/html',
					'sec-fetch-dest': 'document'
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
				incidentId: expect.stringMatching(/^authsign_/)
			});
			expect(errorSpy).toHaveBeenCalledOnce();
			expect(errorSpy).toHaveBeenLastCalledWith(
				expect.any(String),
				expect.objectContaining({
					errorCode: 'AUTH_SIGN_IN_UNEXPECTED_FAILURE',
					pathname: '/auth/sign-in',
					method: 'GET',
					incidentId: expect.stringMatching(/^authsign_/)
				})
			);
		}
	});
});
