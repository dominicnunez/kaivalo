import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildAuthErrorRedirectQuery } from '$lib/auth/auth-error-query.js';

const { mockEnv } = vi.hoisted(() => ({
	mockEnv: {
		NODE_ENV: 'test',
		KAIVALO_ENABLE_TEST_AUTH_FAILURE: '0',
		WORKOS_CLIENT_ID: 'client_123',
		WORKOS_API_KEY: 'sk_test_123',
		WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
		WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
		ORIGIN: 'https://kaivalo.test'
	} as Record<string, string>
}));

vi.mock('@workos/authkit-sveltekit', () => ({
	authKit: {
		getUser: vi.fn(),
		getSignInUrl: vi.fn()
	}
}));

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

import { authKit } from '@workos/authkit-sveltekit';
import { load } from './+layout.server';

function createEvent(origin: string, headers: HeadersInit = {}) {
	return {
		url: new URL(origin),
		request: new Request(origin, { headers })
	} as never;
}

const mockedAuthKit = vi.mocked(authKit);
const baseEvent = createEvent('https://kaivalo.test/');

describe('layout server load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockEnv.NODE_ENV = 'test';
		mockEnv.KAIVALO_ENABLE_TEST_AUTH_FAILURE = '0';
		delete mockEnv.WORKOS_API_HOSTNAME;
	});

	it('returns normalized user data for authenticated requests', async () => {
		mockedAuthKit.getUser.mockResolvedValue({
			firstName: 'Kai',
			email: 'kai@example.com',
			profilePictureUrl: 'https://avatars.githubusercontent.com/u/1'
		} as never);

		const result = await load(baseEvent);

		expect(mockedAuthKit.getSignInUrl).not.toHaveBeenCalled();
		expect(result).toEqual({
			user: {
				firstName: 'Kai',
				email: 'kai@example.com',
				profilePictureUrl: 'https://avatars.githubusercontent.com/u/1'
			},
			signInUrl: null,
			authError: null
		});
	});

	it('drops untrusted profilePictureUrl values', async () => {
		mockedAuthKit.getUser.mockResolvedValue({
			firstName: 'Kai',
			email: 'kai@example.com',
			profilePictureUrl: 'https://attacker.example/track.png'
		} as never);

		const result = await load(baseEvent);

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
		mockedAuthKit.getUser.mockResolvedValue({
			firstName: 'Kai',
			email: 'kai@example.com',
			profilePictureUrl: candidate
		} as never);

		const result = await load(baseEvent);
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

	it('keeps trusted Google profile photos from alternate lh hosts', async () => {
		mockedAuthKit.getUser.mockResolvedValue({
			firstName: 'Kai',
			email: 'kai@example.com',
			profilePictureUrl:
				'https://lh5.googleusercontent.com/a/example-avatar=s96-c'
		} as never);

		const result = await load(baseEvent);

		expect(result).toEqual({
			user: {
				firstName: 'Kai',
				email: 'kai@example.com',
				profilePictureUrl:
					'https://lh5.googleusercontent.com/a/example-avatar=s96-c'
			},
			signInUrl: null,
			authError: null
		});
	});

	it('returns trusted sign-in URL for unauthenticated requests', async () => {
		mockedAuthKit.getUser.mockResolvedValue(null as never);
		mockedAuthKit.getSignInUrl.mockResolvedValue(
			'https://api.workos.com/user_management/authorize' as never
		);

		const result = await load(baseEvent);

		expect(mockedAuthKit.getSignInUrl).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			user: null,
			signInUrl: 'https://api.workos.com/user_management/authorize',
			authError: null
		});
	});

	it('accepts a sign-in URL on the configured WorkOS auth hostname', async () => {
		mockEnv.WORKOS_API_HOSTNAME = 'auth.kaivalo-login.com';
		mockedAuthKit.getUser.mockResolvedValue(null as never);
		mockedAuthKit.getSignInUrl.mockResolvedValue(
			'https://auth.kaivalo-login.com/user_management/authorize?screen_hint=sign-up' as never
		);

		const result = await load(baseEvent);

		expect(result).toEqual({
			user: null,
			signInUrl:
				'https://auth.kaivalo-login.com/user_management/authorize?screen_hint=sign-up',
			authError: null
		});
	});

	it('returns explicit auth-unavailable state when sign-in URL host is untrusted', async () => {
		mockedAuthKit.getUser.mockResolvedValue(null as never);
		mockedAuthKit.getSignInUrl.mockResolvedValue(
			'https://evil.example/login' as never
		);

		const result = await load(baseEvent);
		expect(result).toEqual({
			user: null,
			signInUrl: null,
			authError: {
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: null
			}
		});
	});

	it('accepts signed auth callback query errors and surfaces their incident id', async () => {
		mockedAuthKit.getUser.mockResolvedValue(null as never);
		mockedAuthKit.getSignInUrl.mockResolvedValue('/auth/sign-in' as never);
		const setHeaders = vi.fn();
		const event = {
			url: new URL(
				`https://kaivalo.test/?${buildAuthErrorRedirectQuery({
					incidentId: 'authcb_123e4567-e89b-12d3-a456-426614174000',
					secret: mockEnv.WORKOS_COOKIE_PASSWORD,
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

	it('ignores tampered auth callback query errors', async () => {
		mockedAuthKit.getUser.mockResolvedValue(null as never);
		mockedAuthKit.getSignInUrl.mockResolvedValue('/auth/sign-in' as never);

		const result = await load(
			createEvent(
				'https://kaivalo.test/?error=auth&incident=authcb_123e4567-e89b-12d3-a456-426614174000&ts=1710000000000&sig=forged'
			)
		);

		expect(result).toEqual({
			user: null,
			signInUrl: '/auth/sign-in',
			authError: null
		});
	});

	it.each([
		'https://attacker.test/login',
		'https://attacker.test/auth/sign-in',
		'https://attacker.test/user_management/authorize'
	])(
		'rejects sign-in URLs that only match attacker-controlled request host: %s',
		async (candidate) => {
			mockedAuthKit.getUser.mockResolvedValue(null as never);
			mockedAuthKit.getSignInUrl.mockResolvedValue(candidate as never);

			const result = await load(createEvent('https://attacker.test/'));
			expect(result).toEqual({
				user: null,
				signInUrl: null,
				authError: {
					message:
						'Sign-in is temporarily unavailable. Please try again shortly.',
					incidentId: null
				}
			});
		}
	);

	it.each([
		['protocol-relative url', '//evil.example/login'],
		['near-match relative auth path', '/auth/sign-in-evil'],
		['near-match relative authorize path', '/user_management/authorize-extra'],
		[
			'credentialed https url',
			'https://user:pass@api.workos.com/user_management/authorize'
		],
		['credentialed same-host url', 'https://user:pass@kaivalo.test/sign-in'],
		['non-https scheme', 'http://api.workos.com/user_management/authorize'],
		[
			'trusted host with untrusted port',
			'https://api.workos.com:444/user_management/authorize'
		],
		['trusted host with untrusted path', 'https://api.workos.com/logout'],
		[
			'near-match absolute auth path',
			'https://api.workos.com/auth/sign-in-evil'
		],
		[
			'near-match absolute authorize path',
			'https://api.workos.com/user_management/authorize-extra'
		],
		['javascript scheme', 'javascript:alert(1)'],
		['malformed value', 'not-a-url']
	])(
		'returns explicit auth-unavailable state for unsafe sign-in URL: %s',
		async (_label, candidate) => {
			mockedAuthKit.getUser.mockResolvedValue(null as never);
			mockedAuthKit.getSignInUrl.mockResolvedValue(candidate as never);

			const result = await load(baseEvent);
			expect(result).toEqual({
				user: null,
				signInUrl: null,
				authError: {
					message:
						'Sign-in is temporarily unavailable. Please try again shortly.',
					incidentId: null
				}
			});
		}
	);

	it('converts trusted same-host absolute sign-in URL to relative path', async () => {
		mockedAuthKit.getUser.mockResolvedValue(null as never);
		mockedAuthKit.getSignInUrl.mockResolvedValue(
			'https://kaivalo.test/user_management/authorize?screen_hint=sign-up#top' as never
		);

		const result = await load(baseEvent);
		expect(result).toEqual({
			user: null,
			signInUrl: '/user_management/authorize?screen_hint=sign-up#top',
			authError: null
		});
	});

	it('accepts safe relative sign-in URLs', async () => {
		mockedAuthKit.getUser.mockResolvedValue(null as never);
		mockedAuthKit.getSignInUrl.mockResolvedValue(
			'/auth/sign-in?screen_hint=sign-up' as never
		);

		const result = await load(baseEvent);
		expect(result).toEqual({
			user: null,
			signInUrl: '/auth/sign-in?screen_hint=sign-up',
			authError: null
		});
	});

	it('rejects relative sign-in URLs outside allowed auth paths', async () => {
		mockedAuthKit.getUser.mockResolvedValue(null as never);
		mockedAuthKit.getSignInUrl.mockResolvedValue(
			'/logout?next=/admin' as never
		);

		const result = await load(baseEvent);
		expect(result).toEqual({
			user: null,
			signInUrl: null,
			authError: {
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: null
			}
		});
	});

	it('returns auth-unavailable state and logs incident id when upstream auth calls throw', async () => {
		const errorSpy = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const cause = Object.assign(new Error('upstream detail'), {
			code: 'cause_timeout'
		});
		mockedAuthKit.getUser.mockRejectedValue(
			Object.assign(new Error('upstream failed'), {
				code: 'workos_fetch_failed',
				cause
			}) as never
		);

		const setHeaders = vi.fn();
		const event = {
			url: new URL('https://kaivalo.test/'),
			request: new Request('https://kaivalo.test/', {
				headers: { 'x-request-id': 'bad value + trace' }
			}),
			setHeaders
		} as never;
		const result = await load(event);
		expect(result).toEqual({
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
		expect(errorSpy).toHaveBeenCalledWith(
			'Auth layout load failed',
			expect.objectContaining({
				errorCode: 'AUTH_LAYOUT_UNEXPECTED_FAILURE',
				errorMessage: 'upstream failed',
				errorCauseMessage: 'upstream detail',
				errorUpstreamCode: 'workos_fetch_failed',
				errorCauseCode: 'cause_timeout',
				errorCauseName: 'Error',
				errorName: 'Error',
				pathname: '/',
				requestId: 'bad_value___trace'
			})
		);
		errorSpy.mockRestore();
	});

	it('ignores forced auth-failure header when test toggle is disabled', async () => {
		mockedAuthKit.getUser.mockResolvedValue(null as never);
		mockedAuthKit.getSignInUrl.mockResolvedValue('/auth/sign-in' as never);

		const result = await load(
			createEvent('https://kaivalo.test/', {
				'x-kaivalo-test-auth-failure': '1'
			})
		);

		expect(result).toEqual({
			user: null,
			signInUrl: '/auth/sign-in',
			authError: null
		});
	});

	it('forces auth-unavailable state only when header and test toggle are both enabled', async () => {
		const errorSpy = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		mockEnv.KAIVALO_ENABLE_TEST_AUTH_FAILURE = '1';

		const result = await load(
			createEvent('https://kaivalo.test/', {
				'x-kaivalo-test-auth-failure': '1'
			})
		);

		expect(mockedAuthKit.getUser).not.toHaveBeenCalled();
		expect(result).toEqual({
			user: null,
			signInUrl: null,
			authError: {
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: expect.stringMatching(/^authlayout_/)
			}
		});
		expect(errorSpy).toHaveBeenCalledWith(
			'Auth layout load failed',
			expect.objectContaining({
				errorCode: 'AUTH_LAYOUT_UNEXPECTED_FAILURE',
				errorName: 'Error'
			})
		);
		errorSpy.mockRestore();
	});
});
