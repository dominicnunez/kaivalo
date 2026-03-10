import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAuthErrorRedirectQuery } from '$lib/auth/auth-error-query.ts';

const { mockEnv, mockGetUser, mockGetValidatedWorkosEnv } = vi.hoisted(() => ({
	mockEnv: {
		WORKOS_CLIENT_ID: 'client_123',
		WORKOS_API_KEY: 'sk_test_123',
		WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
		WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
		AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
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

type MockLayoutEvent = {
	url: URL;
	request: Request;
	getClientAddress: () => string;
	setHeaders?: ReturnType<typeof vi.fn>;
};

function createEvent(
	origin: string,
	headers: HeadersInit = {},
	clientAddress = '127.0.0.1'
) {
	return {
		url: new URL(origin),
		request: new Request(origin, { headers }),
		getClientAddress: () => clientAddress
	} satisfies MockLayoutEvent;
}

const baseEvent = createEvent('https://kaivalo.test/');

describe('layout server load', () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		delete mockEnv.DEV_AUTH_BYPASS;
		delete mockEnv.DEV_AUTH_BYPASS_EMAIL;
		delete mockEnv.DEV_AUTH_BYPASS_FIRST_NAME;
		delete mockEnv.NODE_ENV;
		mockEnv.ORIGIN = 'https://kaivalo.test';
		mockEnv.WORKOS_REDIRECT_URI = 'https://kaivalo.test/auth/callback';
		mockGetValidatedWorkosEnv.mockReturnValue({
			origin: 'https://kaivalo.test',
			redirectUri: 'https://kaivalo.test/auth/callback',
			apiHostname: 'api.workos.com'
		} as never);
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		errorSpy.mockRestore();
	});

	it('returns a development bypass user without calling WorkOS when enabled', async () => {
		const setHeaders = vi.fn();
		mockEnv.NODE_ENV = 'development';
		mockEnv.DEV_AUTH_BYPASS = 'true';
		mockEnv.DEV_AUTH_BYPASS_EMAIL = 'local-dev@kaivalo.test';
		mockEnv.DEV_AUTH_BYPASS_FIRST_NAME = 'Local';
		mockEnv.ORIGIN = 'http://localhost:4173';
		mockEnv.WORKOS_REDIRECT_URI = 'http://127.0.0.1:4173/auth/callback';

		const result = await load({
			...createEvent('http://localhost:4173/'),
			setHeaders
		} as never);

		expect(mockGetUser).not.toHaveBeenCalled();
		expect(result).toEqual({
			user: {
				firstName: 'Local',
				email: 'local-dev@kaivalo.test',
				profilePictureUrl: null
			},
			signInUrl: null,
			authError: null
		});
		expect(setHeaders).toHaveBeenCalledWith({
			vary: 'Cookie'
		});
	});

	it.each([
		[
			'non-loopback origin',
			'http://staging.kaivalo.com',
			'http://staging.kaivalo.com/auth/callback'
		],
		[
			'non-http origin scheme',
			'ftp://localhost:4173',
			'http://localhost:4173/auth/callback'
		],
		[
			'origin with path',
			'http://localhost:4173/admin',
			'http://localhost:4173/auth/callback'
		],
		[
			'origin with query',
			'http://localhost:4173/?debug=1',
			'http://localhost:4173/auth/callback'
		],
		[
			'callback with wrong path',
			'http://localhost:4173',
			'http://localhost:4173/not-auth/callback'
		],
		[
			'callback with query',
			'http://localhost:4173',
			'http://localhost:4173/auth/callback?next=/services'
		],
		[
			'callback with fragment',
			'http://localhost:4173',
			'http://localhost:4173/auth/callback#done'
		],
		[
			'callback with invalid scheme',
			'http://localhost:4173',
			'ftp://localhost:4173/auth/callback'
		]
	])(
		'rejects development auth bypass for malformed local configuration: %s',
		async (_label, origin, redirectUri) => {
			mockEnv.NODE_ENV = 'development';
			mockEnv.DEV_AUTH_BYPASS = 'true';
			mockEnv.ORIGIN = origin;
			mockEnv.WORKOS_REDIRECT_URI = redirectUri;

			const result = await load(baseEvent as never);

			expect(mockGetUser).not.toHaveBeenCalled();
			expect(result).toMatchObject({
				user: null,
				signInUrl: null,
				authError: {
					message:
						'Sign-in is temporarily unavailable. Please try again shortly.',
					incidentId: expect.stringMatching(/^authlayout_/)
				}
			});
			expect(errorSpy).toHaveBeenCalledOnce();
			expect(errorSpy).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					errorCode: 'AUTH_LAYOUT_UNEXPECTED_FAILURE',
					errorMessage:
						'DEV_AUTH_BYPASS requires NODE_ENV=development with loopback-only ORIGIN and WORKOS_REDIRECT_URI callback URL.',
					errorName: 'Error',
					method: 'GET',
					pathname: '/',
					requestId: 'missing',
					incidentId: expect.stringMatching(/^authlayout_/)
				})
			);
		}
	);

	it('rejects development auth bypass when the live request hostname is not loopback', async () => {
		mockEnv.NODE_ENV = 'development';
		mockEnv.DEV_AUTH_BYPASS = 'true';
		mockEnv.ORIGIN = 'http://localhost:4173';
		mockEnv.WORKOS_REDIRECT_URI = 'http://127.0.0.1:4173/auth/callback';

		const result = await load(
			createEvent('http://staging.kaivalo.test:4173/') as never
		);

		expect(mockGetUser).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			user: null,
			signInUrl: null,
			authError: {
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: expect.stringMatching(/^authlayout_/)
			}
		});
		expect(errorSpy).toHaveBeenCalledOnce();
		expect(errorSpy).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				errorCode: 'AUTH_LAYOUT_UNEXPECTED_FAILURE',
				method: 'GET',
				pathname: '/',
				incidentId: expect.stringMatching(/^authlayout_/),
				errorMessage:
					'DEV_AUTH_BYPASS only serves requests from loopback hosts and loopback clients.'
			})
		);
	});

	it('rejects development auth bypass when the client is not loopback', async () => {
		mockEnv.NODE_ENV = 'development';
		mockEnv.DEV_AUTH_BYPASS = 'true';
		mockEnv.ORIGIN = 'http://localhost:4173';
		mockEnv.WORKOS_REDIRECT_URI = 'http://127.0.0.1:4173/auth/callback';

		const result = await load(
			createEvent('http://localhost:4173/', {}, '203.0.113.25') as never
		);

		expect(mockGetUser).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			user: null,
			signInUrl: null,
			authError: {
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: expect.stringMatching(/^authlayout_/)
			}
		});
		expect(errorSpy).toHaveBeenCalledOnce();
		expect(errorSpy).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				errorCode: 'AUTH_LAYOUT_UNEXPECTED_FAILURE',
				method: 'GET',
				pathname: '/',
				incidentId: expect.stringMatching(/^authlayout_/),
				errorMessage:
					'DEV_AUTH_BYPASS only serves requests from loopback hosts and loopback clients.'
			})
		);
	});

	it('returns normalized user data for authenticated requests', async () => {
		const setHeaders = vi.fn();
		mockGetValidatedWorkosEnv.mockImplementation(() => {
			throw new Error('authenticated requests should not validate auth entry');
		});
		mockGetUser.mockResolvedValue({
			firstName: 'Kai',
			email: 'kai@example.com',
			profilePictureUrl: 'https://avatars.githubusercontent.com/u/1'
		} as never);

		const result = await load({
			...baseEvent,
			setHeaders
		} as never);

		expect(result).toEqual({
			user: {
				firstName: 'Kai',
				email: 'kai@example.com',
				profilePictureUrl:
					'/avatar?source=https%3A%2F%2Favatars.githubusercontent.com%2Fu%2F1'
			},
			signInUrl: null,
			authError: null
		});
		expect(setHeaders).toHaveBeenCalledWith({
			vary: 'Cookie'
		});
	});

	it('trims authenticated user fields before exposing them to the app shell', async () => {
		mockGetUser.mockResolvedValue({
			firstName: '  Kai  ',
			email: '  kai@example.com  ',
			profilePictureUrl: '  https://avatars.githubusercontent.com/u/1  '
		} as never);

		const result = await load(baseEvent as never);

		expect(result).toEqual({
			user: {
				firstName: 'Kai',
				email: 'kai@example.com',
				profilePictureUrl:
					'/avatar?source=https%3A%2F%2Favatars.githubusercontent.com%2Fu%2F1'
			},
			signInUrl: null,
			authError: null
		});
	});

	it('drops query strings and fragments from trusted avatar urls', async () => {
		mockGetUser.mockResolvedValue({
			firstName: 'Kai',
			email: 'kai@example.com',
			profilePictureUrl:
				'https://avatars.githubusercontent.com/u/1?token=signed#tracker'
		} as never);

		const result = await load(baseEvent as never);

		expect(result).toEqual({
			user: {
				firstName: 'Kai',
				email: 'kai@example.com',
				profilePictureUrl:
					'/avatar?source=https%3A%2F%2Favatars.githubusercontent.com%2Fu%2F1'
			},
			signInUrl: null,
			authError: null
		});
	});

	it.each([
		['http url', 'http://avatars.githubusercontent.com/u/1'],
		['non-default https port', 'https://avatars.githubusercontent.com:444/u/1'],
		[
			'credentialed https url',
			'https://user:pass@avatars.githubusercontent.com/u/1'
		],
		['javascript url', 'javascript:alert(1)'],
		['data url', 'data:image/png;base64,iVBORw0KGgo='],
		['malformed value', 'not-a-url'],
		['untrusted but valid host', 'https://cdn.attacker.example/avatar.png']
	])('drops unsafe profilePictureUrl value: %s', async (_label, candidate) => {
		mockGetUser.mockResolvedValue({
			firstName: 'Kai',
			email: 'kai@example.com',
			profilePictureUrl: candidate
		} as never);

		const result = await load(baseEvent as never);

		expect(result).toEqual({
			user: {
				firstName: 'Kai',
				email: 'kai@example.com',
				profilePictureUrl: null
			},
			signInUrl: null,
			authError: null
		});
	});

	it('returns the local sign-in route for unauthenticated requests', async () => {
		const setHeaders = vi.fn();
		mockGetUser.mockResolvedValue(null as never);

		const result = await load({
			...baseEvent,
			setHeaders
		} as never);

		expect(mockGetValidatedWorkosEnv).toHaveBeenCalledOnce();
		expect(result).toEqual({
			user: null,
			signInUrl: '/auth/sign-in',
			authError: null
		});
		expect(setHeaders).toHaveBeenCalledWith({
			vary: 'Cookie'
		});
	});

	it('returns explicit auth-unavailable state when auth entry configuration is invalid', async () => {
		mockGetUser.mockResolvedValue(null as never);
		mockGetValidatedWorkosEnv.mockImplementation(() => {
			throw new Error('Missing required environment variable: WORKOS_API_KEY');
		});

		const result = await load(baseEvent as never);

		expect(result).toMatchObject({
			user: null,
			signInUrl: null,
			authError: {
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: expect.stringMatching(/^authlayout_/)
			}
		});
		expect(errorSpy).toHaveBeenCalledOnce();
		expect(errorSpy).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				errorCode: 'AUTH_LAYOUT_UNEXPECTED_FAILURE',
				errorMessage: 'Missing required environment variable: WORKOS_API_KEY',
				errorName: 'Error',
				method: 'GET',
				pathname: '/',
				requestId: 'missing',
				incidentId: expect.stringMatching(/^authlayout_/)
			})
		);
	});

	it('preserves the local sign-in route when AuthKit lookup fails', async () => {
		const setHeaders = vi.fn();
		mockGetUser.mockRejectedValue(
			new Error('AuthKit upstream timeout') as never
		);
		const event = createEvent('https://kaivalo.test/');

		const result = await load({
			...event,
			setHeaders
		} as never);

		expect(mockGetValidatedWorkosEnv).toHaveBeenCalledOnce();
		expect(result).toMatchObject({
			user: null,
			signInUrl: '/auth/sign-in',
			authError: {
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: expect.stringMatching(/^authlayout_/)
			}
		});
		expect(setHeaders).toHaveBeenCalledWith({
			'cache-control': 'private, no-store',
			vary: 'Cookie, Authorization'
		});
		expect(errorSpy).toHaveBeenCalledOnce();
		expect(errorSpy).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				errorCode: 'AUTH_LAYOUT_UNEXPECTED_FAILURE',
				errorMessage: 'AuthKit upstream timeout',
				errorName: 'Error',
				method: 'GET',
				pathname: '/',
				requestId: 'missing',
				incidentId: expect.stringMatching(/^authlayout_/)
			})
		);
	});

	it.each([
		[
			'empty email',
			{
				firstName: 'Kai',
				email: '   ',
				profilePictureUrl: null
			},
			'AuthKit returned an empty email'
		],
		[
			'non-string email',
			{
				firstName: 'Kai',
				email: 42,
				profilePictureUrl: null
			},
			'AuthKit returned a non-string email'
		],
		[
			'non-string first name',
			{
				firstName: ['Kai'],
				email: 'kai@example.com',
				profilePictureUrl: null
			},
			'AuthKit returned a non-string firstName'
		],
		[
			'non-string profile picture url',
			{
				firstName: 'Kai',
				email: 'kai@example.com',
				profilePictureUrl: 7
			},
			'AuthKit returned a non-string profilePictureUrl'
		]
	])(
		'rejects malformed authenticated payloads from AuthKit: %s',
		async (_label, payload, expectedMessage) => {
			const setHeaders = vi.fn();
			mockGetUser.mockResolvedValue(payload as never);

			const result = await load({
				...createEvent('https://kaivalo.test/'),
				setHeaders
			} as never);

			expect(result).toMatchObject({
				user: null,
				signInUrl: '/auth/sign-in',
				authError: {
					message:
						'Sign-in is temporarily unavailable. Please try again shortly.',
					incidentId: expect.stringMatching(/^authlayout_/)
				}
			});
			expect(setHeaders).toHaveBeenCalledWith({
				'cache-control': 'private, no-store',
				vary: 'Cookie, Authorization'
			});
			expect(errorSpy).toHaveBeenCalledOnce();
			expect(errorSpy).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					errorCode: 'AUTH_LAYOUT_UNEXPECTED_FAILURE',
					errorMessage: expectedMessage,
					errorName: 'Error',
					method: 'GET',
					pathname: '/',
					requestId: 'missing',
					incidentId: expect.stringMatching(/^authlayout_/)
				})
			);
		}
	);

	it('surfaces signed auth callback query errors only while sign-in remains unavailable', async () => {
		mockGetUser.mockResolvedValue(null as never);
		mockGetValidatedWorkosEnv.mockImplementation(() => {
			throw new Error('auth entry unavailable');
		});
		const setHeaders = vi.fn();
		const event = {
			url: new URL(
				`https://kaivalo.test/?${buildAuthErrorRedirectQuery({
					incidentId: 'authcb_123e4567-e89b-12d3-a456-426614174000',
					secret: mockEnv.AUTH_ERROR_SIGNING_SECRET,
					now: Date.now()
				})}`
			),
			request: new Request('https://kaivalo.test/'),
			setHeaders
		} as never;

		const result = await load(event);

		expect(result).toMatchObject({
			user: null,
			signInUrl: null,
			authError: {
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: expect.stringMatching(/^authlayout_/)
			}
		});
		expect(setHeaders).toHaveBeenCalledWith({
			'cache-control': 'private, no-store',
			vary: 'Cookie, Authorization'
		});
	});

	it('preserves signed auth callback query errors for unauthenticated users', async () => {
		mockGetUser.mockResolvedValue(null as never);
		const setHeaders = vi.fn();
		const event = {
			url: new URL(
				`https://kaivalo.test/?${buildAuthErrorRedirectQuery({
					incidentId: 'authcb_123e4567-e89b-12d3-a456-426614174000',
					secret: mockEnv.AUTH_ERROR_SIGNING_SECRET,
					now: Date.now()
				})}`
			),
			request: new Request('https://kaivalo.test/'),
			setHeaders
		} as never;

		const result = await load(event);

		expect(result).toEqual({
			user: null,
			signInUrl: '/auth/sign-in',
			authError: {
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: 'authcb_123e4567-e89b-12d3-a456-426614174000'
			}
		});
		expect(setHeaders).toHaveBeenCalledWith({
			'cache-control': 'private, no-store',
			vary: 'Cookie, Authorization'
		});
	});

	it('verifies signed auth callback query errors with the trimmed auth secret', async () => {
		mockEnv.AUTH_ERROR_SIGNING_SECRET = `  ${'cd'.repeat(32)}  `;
		mockGetValidatedWorkosEnv.mockReturnValue({
			origin: 'https://kaivalo.test',
			redirectUri: 'https://kaivalo.test/auth/callback',
			apiHostname: 'api.workos.com',
			authErrorSigningSecret: 'cd'.repeat(32)
		} as never);
		mockGetUser.mockResolvedValue(null as never);
		const setHeaders = vi.fn();
		const event = {
			url: new URL(
				`https://kaivalo.test/?${buildAuthErrorRedirectQuery({
					incidentId: 'authcb_123e4567-e89b-12d3-a456-426614174000',
					secret: 'cd'.repeat(32),
					now: Date.now()
				})}`
			),
			request: new Request('https://kaivalo.test/'),
			setHeaders
		} as never;

		const result = await load(event);

		expect(result).toEqual({
			user: null,
			signInUrl: '/auth/sign-in',
			authError: {
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: 'authcb_123e4567-e89b-12d3-a456-426614174000'
			}
		});
		expect(setHeaders).toHaveBeenCalledWith({
			'cache-control': 'private, no-store',
			vary: 'Cookie, Authorization'
		});
	});

	it('ignores signed auth callback query errors once the user is authenticated', async () => {
		const setHeaders = vi.fn();
		mockGetUser.mockResolvedValue({
			firstName: 'Kai',
			email: 'kai@example.com',
			profilePictureUrl: 'https://avatars.githubusercontent.com/u/1'
		} as never);

		const result = await load({
			...createEvent(
				`https://kaivalo.test/?${buildAuthErrorRedirectQuery({
					incidentId: 'authcb_123e4567-e89b-12d3-a456-426614174000',
					secret: mockEnv.AUTH_ERROR_SIGNING_SECRET,
					now: Date.now()
				})}`
			),
			setHeaders
		} as never);

		expect(result).toEqual({
			user: {
				firstName: 'Kai',
				email: 'kai@example.com',
				profilePictureUrl:
					'/avatar?source=https%3A%2F%2Favatars.githubusercontent.com%2Fu%2F1'
			},
			signInUrl: null,
			authError: null
		});
		expect(setHeaders).toHaveBeenCalledWith({
			vary: 'Cookie'
		});
	});

	it('ignores tampered auth callback query errors', async () => {
		const setHeaders = vi.fn();
		mockGetUser.mockResolvedValue(null as never);

		const result = await load({
			...createEvent(
				'https://kaivalo.test/?error=auth&incident=authcb_123e4567-e89b-12d3-a456-426614174000&ts=1710000000000&sig=forged'
			),
			setHeaders
		} as never);

		expect(result).toEqual({
			user: null,
			signInUrl: '/auth/sign-in',
			authError: null
		});
		expect(setHeaders).toHaveBeenCalledWith({
			vary: 'Cookie'
		});
	});
});
