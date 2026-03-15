import { isRedirect, type Handle } from '@sveltejs/kit';
import {
	SessionEncryptionError,
	TokenRefreshError
} from '@workos/authkit-session';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	AUTH_NOTICE_QUERY_NAME,
	AUTH_NOTICE_SIGN_IN_CANCELLED_VALUE
} from '../auth/auth-notice-query.ts';
import {
	WORKOS_CALLBACK_STATE_COOKIE_NAME,
	createConfiguredWorkosSignOutRequestHandler,
	createWorkosSignInStart,
	createWorkosCallbackRequestHandler,
	createWorkosSessionHandle
} from './workos-auth.ts';

type SessionResolve = Parameters<Handle>[0]['resolve'];
type SessionEvent = Parameters<SessionResolve>[0];

function createEvent(
	requestUrl: string,
	headers: HeadersInit = {}
): {
	locals: App.Locals;
	request: Request;
	url: URL;
} {
	return {
		locals: {
			auth: {
				user: null,
				organizationId: null,
				role: null,
				permissions: [],
				sessionId: undefined,
				impersonator: null,
				accessToken: undefined
			}
		},
		request: new Request(requestUrl, {
			method: 'GET',
			headers
		}),
		url: new URL(requestUrl)
	};
}

function buildCallbackState(
	nonce: string,
	returnPathname = '/services'
): string {
	return [
		Buffer.from(JSON.stringify({ returnPathname }), 'utf8').toString(
			'base64url'
		),
		nonce
	].join('.');
}

describe('WorkOS auth sign-in start', () => {
	it('mints a nonce cookie and passes the nonce through state', async () => {
		const getSignInUrl = vi.fn(
			async () => 'https://auth.kaivalo-login.com/start'
		);
		const startSignIn = createWorkosSignInStart({
			getSignInUrl,
			createState: () => 'nonce-value'
		});

		const result = await startSignIn({
			returnTo: '/services'
		});

		expect(getSignInUrl).toHaveBeenCalledWith({
			returnPathname: '/services',
			state: 'nonce-value'
		});
		expect(result.location).toBe('https://auth.kaivalo-login.com/start');
		expect(result.headers).toMatchObject({
			'set-cookie': expect.stringContaining(
				`${WORKOS_CALLBACK_STATE_COOKIE_NAME}=nonce-value`
			)
		});
		expect(
			String((result.headers as Record<string, string>)['set-cookie'])
		).toContain('Path=/');
	});
});

describe('WorkOS auth callback request handling', () => {
	it('translates callback error params without emitting raw console logs', async () => {
		const consoleError = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const handleCallback = vi.fn();
		const handler = createWorkosCallbackRequestHandler({
			handleCallback
		});

		await expect(
			handler(
				createEvent(
					`https://kaivalo.test/auth/callback?error=oauth_code=secret&state=${buildCallbackState('nonce-value')}`,
					{
						accept: 'text/html',
						cookie: `${WORKOS_CALLBACK_STATE_COOKIE_NAME}=nonce-value`
					}
				) as never
			)
		).rejects.toSatisfy((caught: unknown) => {
			expect(isRedirect(caught)).toBe(true);
			if (!isRedirect(caught)) {
				return false;
			}

			expect(caught.status).toBe(302);
			const location = new URL(caught.location, 'https://kaivalo.test');
			expect(location.pathname).toBe('/auth/error');
			expect(location.searchParams.get('code')).toBe('AUTH_ERROR');
			expect(location.searchParams.get('provider_code')).toBe(
				'oauth_code_secret'
			);
			return true;
		});

		expect(handleCallback).not.toHaveBeenCalled();
		expect(consoleError).not.toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it('rejects provider error callbacks that do not present the matching auth flow cookie', async () => {
		const handleCallback = vi.fn();
		const handler = createWorkosCallbackRequestHandler({
			handleCallback
		});
		const nonce = 'ef'.repeat(32);

		await expect(
			handler(
				createEvent(
					`https://kaivalo.test/auth/callback?error=temporarily_unavailable&state=${buildCallbackState(nonce)}`
				) as never
			)
		).rejects.toThrow(/state/i);

		expect(handleCallback).not.toHaveBeenCalled();
	});

	it('treats access_denied callbacks as a user-cancelled sign-in flow', async () => {
		const handleCallback = vi.fn();
		const handler = createWorkosCallbackRequestHandler({
			handleCallback
		});
		const nonce = 'de'.repeat(32);

		await expect(
			handler(
				createEvent(
					`https://kaivalo.test/auth/callback?error=access_denied&state=${buildCallbackState(nonce)}`,
					{
						accept: 'text/html',
						cookie: `${WORKOS_CALLBACK_STATE_COOKIE_NAME}=${nonce}`
					}
				) as never
			)
		).rejects.toSatisfy((caught: unknown) => {
			expect(isRedirect(caught)).toBe(true);
			if (!isRedirect(caught)) {
				return false;
			}

			expect(caught.status).toBe(302);
			const location = new URL(caught.location, 'https://kaivalo.test');
			expect(location.pathname).toBe('/');
			expect(location.searchParams.get(AUTH_NOTICE_QUERY_NAME)).toBe(
				AUTH_NOTICE_SIGN_IN_CANCELLED_VALUE
			);
			return true;
		});

		expect(handleCallback).not.toHaveBeenCalled();
	});

	it('rejects code callbacks that do not present the matching auth flow cookie', async () => {
		const handleCallback = vi.fn();
		const handler = createWorkosCallbackRequestHandler({
			handleCallback
		});
		const nonce = 'ab'.repeat(32);

		await expect(
			handler(
				createEvent(
					`https://kaivalo.test/auth/callback?code=valid-code&state=${buildCallbackState(nonce)}`
				) as never
			)
		).rejects.toThrow(/state/i);

		expect(handleCallback).not.toHaveBeenCalled();
	});

	it('preserves the upstream session cookie after a successful callback', async () => {
		const handleCallback = vi.fn(async () => ({
			response: new Response(null, {
				status: 200
			}),
			headers: {
				'Set-Cookie':
					'__Host-wos_session=session; Path=/; Max-Age=10; HttpOnly; Secure; SameSite=Lax'
			},
			returnPathname: '/services',
			state: undefined,
			authResponse: {}
		}));
		const handler = createWorkosCallbackRequestHandler({
			handleCallback
		});
		const nonce = 'cd'.repeat(32);

		const response = await handler(
			createEvent(
				`https://kaivalo.test/auth/callback?code=valid-code&state=${buildCallbackState(nonce)}`,
				{
					cookie: `${WORKOS_CALLBACK_STATE_COOKIE_NAME}=${nonce}`
				}
			) as never
		);

		expect(handleCallback).toHaveBeenCalledOnce();
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/services');
		expect(response.headers.get('set-cookie')).toContain(
			'__Host-wos_session=session'
		);
	});
});

describe('WorkOS auth sign-out request handling', () => {
	it('generates WorkOS logout redirects with a return_to for authenticated sessions', async () => {
		const handler = createConfiguredWorkosSignOutRequestHandler({
			clientId: 'client_123',
			apiKey: 'sk_test_123',
			redirectUri: 'https://kaivalo.test/auth/callback',
			cookiePassword: 'ab'.repeat(32),
			apiHostname: 'auth.kaivalo-login.com',
			origin: 'https://kaivalo.test'
		});
		const event = createEvent('https://kaivalo.test/auth/sign-out');
		event.locals.auth.sessionId = 'session_123';

		const response = await handler(event as never);

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).not.toBeNull();
		const location = new URL(String(response.headers.get('location')));
		expect(location.origin).toBe('https://auth.kaivalo-login.com');
		expect(location.pathname).toBe('/user_management/sessions/logout');
		expect(location.searchParams.get('session_id')).toBe('session_123');
		expect(location.searchParams.get('return_to')).toBe('https://kaivalo.test');
		expect(response.headers.get('set-cookie')).toContain('__Host-wos_session=');
		expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
	});
});

describe('WorkOS auth session handling', () => {
	const getEncryptedSession = vi.fn();
	const decryptSession = vi.fn();
	const validateAndRefresh = vi.fn();
	const encryptSession = vi.fn();
	const saveSession = vi.fn();
	const clearSession = vi.fn();

	beforeEach(() => {
		getEncryptedSession.mockReset();
		decryptSession.mockReset();
		validateAndRefresh.mockReset();
		encryptSession.mockReset();
		saveSession.mockReset();
		clearSession.mockReset();
		saveSession.mockResolvedValue({
			headers: {
				'Set-Cookie':
					'__Host-wos_session=refreshed; Path=/; Max-Age=10; HttpOnly; Secure; SameSite=Lax'
			}
		});
		clearSession.mockResolvedValue({
			headers: {
				'Set-Cookie':
					'__Host-wos_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'
			}
		});
	});

	it('clears undecryptable presented sessions and continues as anonymous traffic', async () => {
		getEncryptedSession.mockResolvedValue('encrypted-session');
		decryptSession.mockRejectedValue(
			new SessionEncryptionError('decrypt token=super-secret failed')
		);
		const logError = vi.fn();
		const resolve = vi.fn<SessionResolve>(async (event: SessionEvent) => {
			expect(event.locals.auth).toEqual({
				user: null,
				organizationId: null,
				role: null,
				permissions: [],
				sessionId: undefined,
				impersonator: null,
				accessToken: undefined
			});

			return new Response('<html>anonymous</html>', {
				status: 200,
				headers: {
					'content-type': 'text/html; charset=utf-8'
				}
			});
		});
		const handler = createWorkosSessionHandle({
			deps: {
				getEncryptedSession,
				decryptSession,
				validateAndRefresh,
				encryptSession,
				saveSession,
				clearSession
			},
			includeMessageInLogs: true,
			logError
		});

		const response = await handler({
			event: createEvent('https://kaivalo.test/services', {
				cookie: '__Host-wos_session=broken',
				'x-request-id': 'bad request/+trace'
			}) as never,
			resolve
		});

		expect(resolve).toHaveBeenCalledOnce();
		expect(clearSession).toHaveBeenCalledOnce();
		expect(response.status).toBe(200);
		expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
		expect(logError).toHaveBeenCalledWith(
			'Auth session rejected',
			expect.objectContaining({
				errorCode: 'AUTH_SESSION_REJECTED',
				errorName: 'SessionEncryptionError',
				requestId: 'bad_request__trace',
				pathname: '/services',
				method: 'GET'
			})
		);
		expect(logError.mock.calls[0]?.[1]?.errorMessage).not.toContain(
			'super-secret'
		);
	});

	it('clears sessions and continues anonymously when WorkOS rejects the refresh', async () => {
		getEncryptedSession.mockResolvedValue('encrypted-session');
		decryptSession.mockResolvedValue({
			accessToken: 'expired-token',
			refreshToken: 'refresh-token',
			user: {
				email: 'kai@example.com'
			}
		});
		validateAndRefresh.mockRejectedValue(
			new TokenRefreshError('refresh failed with refresh_token=super-secret', {
				status: 401,
				message: 'invalid_grant'
			})
		);
		const logError = vi.fn();
		const resolve = vi.fn<SessionResolve>(async (event: SessionEvent) => {
			expect(event.locals.auth.user).toBeNull();
			return new Response('anonymous', {
				status: 200
			});
		});
		const handler = createWorkosSessionHandle({
			deps: {
				getEncryptedSession,
				decryptSession,
				validateAndRefresh,
				encryptSession,
				saveSession,
				clearSession
			},
			includeMessageInLogs: true,
			logError
		});

		const response = await handler({
			event: createEvent('https://kaivalo.test/services', {
				cookie: '__Host-wos_session=expired'
			}) as never,
			resolve
		});

		expect(resolve).toHaveBeenCalledOnce();
		expect(clearSession).toHaveBeenCalledOnce();
		expect(response.status).toBe(200);
		expect(logError).toHaveBeenCalledWith(
			'Auth session rejected',
			expect.objectContaining({
				errorCode: 'AUTH_SESSION_REJECTED',
				errorName: 'TokenRefreshError'
			})
		);
		expect(logError.mock.calls[0]?.[1]?.errorMessage).not.toContain(
			'super-secret'
		);
	});

	it('returns a controlled 503 when auth refresh fails unexpectedly', async () => {
		getEncryptedSession.mockResolvedValue('encrypted-session');
		decryptSession.mockResolvedValue({
			accessToken: 'expired-token',
			refreshToken: 'refresh-token',
			user: {
				email: 'kai@example.com'
			}
		});
		validateAndRefresh.mockRejectedValue(
			new TokenRefreshError('refresh failed with refresh_token=super-secret', {
				status: 503,
				message: 'service unavailable'
			})
		);
		const logError = vi.fn();
		const resolve = vi.fn();
		const handler = createWorkosSessionHandle({
			deps: {
				getEncryptedSession,
				decryptSession,
				validateAndRefresh,
				encryptSession,
				saveSession,
				clearSession
			},
			includeMessageInLogs: true,
			logError
		});

		const response = await handler({
			event: createEvent('https://kaivalo.test/services', {
				cookie: '__Host-wos_session=expired'
			}) as never,
			resolve
		});

		expect(resolve).not.toHaveBeenCalled();
		expect(response.status).toBe(503);
		await expect(response.text()).resolves.toMatch(
			/^Authentication failed\. Reference: authmw_[0-9a-f-]+$/
		);
		expect(logError).toHaveBeenCalledWith(
			'Auth session unavailable',
			expect.objectContaining({
				errorCode: 'AUTH_SESSION_UNEXPECTED_FAILURE',
				errorName: 'TokenRefreshError'
			})
		);
		expect(logError.mock.calls[0]?.[1]?.errorMessage).not.toContain(
			'super-secret'
		);
	});

	it('returns a controlled 503 when refreshed session encryption fails', async () => {
		getEncryptedSession.mockResolvedValue('encrypted-session');
		decryptSession.mockResolvedValue({
			accessToken: 'expired-token',
			refreshToken: 'refresh-token',
			user: {
				email: 'kai@example.com',
				firstName: 'Kai'
			}
		});
		validateAndRefresh.mockResolvedValue({
			valid: true,
			refreshed: true,
			session: {
				accessToken: 'access-token',
				refreshToken: 'refresh-token',
				user: {
					email: 'kai@example.com',
					firstName: 'Kai'
				}
			},
			claims: {
				sid: 'session_123',
				org_id: 'org_123',
				role: 'member',
				permissions: ['launch']
			}
		});
		encryptSession.mockRejectedValue(new Error('encryption unavailable'));
		const logError = vi.fn();
		const resolve = vi.fn();
		const handler = createWorkosSessionHandle({
			deps: {
				getEncryptedSession,
				decryptSession,
				validateAndRefresh,
				encryptSession,
				saveSession,
				clearSession
			},
			logError
		});

		const response = await handler({
			event: createEvent('https://kaivalo.test/services', {
				cookie: '__Host-wos_session=current'
			}) as never,
			resolve
		});

		expect(resolve).not.toHaveBeenCalled();
		expect(saveSession).not.toHaveBeenCalled();
		expect(response.status).toBe(503);
		await expect(response.text()).resolves.toMatch(
			/^Authentication failed\. Reference: authmw_[0-9a-f-]+$/
		);
		expect(logError).toHaveBeenCalledWith(
			'Auth session unavailable',
			expect.objectContaining({
				errorCode: 'AUTH_SESSION_UNEXPECTED_FAILURE',
				errorName: 'Error'
			})
		);
	});

	it('returns a controlled 503 when clearing a rejected session fails', async () => {
		getEncryptedSession.mockResolvedValue('encrypted-session');
		decryptSession.mockRejectedValue(
			new SessionEncryptionError('decrypt token failed')
		);
		clearSession.mockRejectedValue(new Error('cookie storage unavailable'));
		const logError = vi.fn();
		const resolve = vi.fn<SessionResolve>(async () => {
			return new Response('anonymous', {
				status: 200
			});
		});
		const handler = createWorkosSessionHandle({
			deps: {
				getEncryptedSession,
				decryptSession,
				validateAndRefresh,
				encryptSession,
				saveSession,
				clearSession
			},
			logError
		});

		const response = await handler({
			event: createEvent('https://kaivalo.test/services', {
				cookie: '__Host-wos_session=broken'
			}) as never,
			resolve
		});

		expect(resolve).not.toHaveBeenCalled();
		expect(response.status).toBe(503);
		await expect(response.text()).resolves.toMatch(
			/^Authentication failed\. Reference: authmw_[0-9a-f-]+$/
		);
		expect(logError).toHaveBeenNthCalledWith(
			1,
			'Auth session rejected',
			expect.objectContaining({
				errorCode: 'AUTH_SESSION_REJECTED',
				errorName: 'SessionEncryptionError'
			})
		);
		expect(logError).toHaveBeenNthCalledWith(
			2,
			'Auth session unavailable',
			expect.objectContaining({
				errorCode: 'AUTH_SESSION_UNEXPECTED_FAILURE',
				errorName: 'Error'
			})
		);
	});

	it('preserves downstream application errors after clearing a rejected session', async () => {
		getEncryptedSession.mockResolvedValue('encrypted-session');
		decryptSession.mockRejectedValue(
			new SessionEncryptionError('decrypt token failed')
		);
		const logError = vi.fn();
		const downstreamError = new Error('render exploded');
		const resolve = vi.fn<SessionResolve>(async () => {
			throw downstreamError;
		});
		const handler = createWorkosSessionHandle({
			deps: {
				getEncryptedSession,
				decryptSession,
				validateAndRefresh,
				encryptSession,
				saveSession,
				clearSession
			},
			logError
		});

		await expect(
			handler({
				event: createEvent('https://kaivalo.test/services', {
					cookie: '__Host-wos_session=broken'
				}) as never,
				resolve
			})
		).rejects.toBe(downstreamError);

		expect(clearSession).toHaveBeenCalledOnce();
		expect(logError).toHaveBeenCalledOnce();
		expect(logError).toHaveBeenCalledWith(
			'Auth session rejected',
			expect.objectContaining({
				errorCode: 'AUTH_SESSION_REJECTED',
				errorName: 'SessionEncryptionError'
			})
		);
	});

	it('returns a controlled 503 when saving a refreshed session fails', async () => {
		getEncryptedSession.mockResolvedValue('encrypted-session');
		decryptSession.mockResolvedValue({
			accessToken: 'expired-token',
			refreshToken: 'refresh-token',
			user: {
				email: 'kai@example.com',
				firstName: 'Kai'
			}
		});
		validateAndRefresh.mockResolvedValue({
			valid: true,
			refreshed: true,
			session: {
				accessToken: 'access-token',
				refreshToken: 'refresh-token',
				user: {
					email: 'kai@example.com',
					firstName: 'Kai'
				}
			},
			claims: {
				sid: 'session_123',
				org_id: 'org_123',
				role: 'member',
				permissions: ['launch']
			}
		});
		encryptSession.mockResolvedValue('refreshed-session');
		saveSession.mockRejectedValue(new Error('cookie storage unavailable'));
		const logError = vi.fn();
		const resolve = vi.fn<SessionResolve>(async () => {
			return new Response('ok', {
				status: 200,
				headers: {
					'content-type': 'text/plain; charset=utf-8'
				}
			});
		});
		const handler = createWorkosSessionHandle({
			deps: {
				getEncryptedSession,
				decryptSession,
				validateAndRefresh,
				encryptSession,
				saveSession,
				clearSession
			},
			logError
		});

		const response = await handler({
			event: createEvent('https://kaivalo.test/services', {
				cookie: '__Host-wos_session=current'
			}) as never,
			resolve
		});

		expect(resolve).toHaveBeenCalledOnce();
		expect(saveSession).toHaveBeenCalledWith(undefined, 'refreshed-session');
		expect(response.status).toBe(503);
		await expect(response.text()).resolves.toMatch(
			/^Authentication failed\. Reference: authmw_[0-9a-f-]+$/
		);
		expect(logError).toHaveBeenCalledWith(
			'Auth session unavailable',
			expect.objectContaining({
				errorCode: 'AUTH_SESSION_UNEXPECTED_FAILURE',
				errorName: 'Error'
			})
		);
	});

	it('persists refreshed sessions after successful validation', async () => {
		getEncryptedSession.mockResolvedValue('encrypted-session');
		decryptSession.mockResolvedValue({
			accessToken: 'expired-token',
			refreshToken: 'refresh-token',
			user: {
				email: 'kai@example.com',
				firstName: 'Kai'
			}
		});
		validateAndRefresh.mockResolvedValue({
			valid: true,
			refreshed: true,
			session: {
				accessToken: 'access-token',
				refreshToken: 'refresh-token',
				user: {
					email: 'kai@example.com',
					firstName: 'Kai'
				}
			},
			claims: {
				sid: 'session_123',
				org_id: 'org_123',
				role: 'member',
				permissions: ['launch']
			}
		});
		encryptSession.mockResolvedValue('refreshed-session');
		const resolve = vi.fn<SessionResolve>(async (event: SessionEvent) => {
			expect(event.locals.auth).toEqual({
				user: {
					email: 'kai@example.com',
					firstName: 'Kai'
				},
				organizationId: 'org_123',
				role: 'member',
				permissions: ['launch'],
				sessionId: 'session_123',
				impersonator: null,
				accessToken: 'access-token'
			});
			return new Response('ok', {
				status: 200,
				headers: {
					'content-type': 'text/plain; charset=utf-8'
				}
			});
		});
		const handler = createWorkosSessionHandle({
			deps: {
				getEncryptedSession,
				decryptSession,
				validateAndRefresh,
				encryptSession,
				saveSession,
				clearSession
			}
		});

		const response = await handler({
			event: createEvent('https://kaivalo.test/services', {
				cookie: '__Host-wos_session=current'
			}) as never,
			resolve
		});

		expect(resolve).toHaveBeenCalledOnce();
		expect(encryptSession).toHaveBeenCalledOnce();
		expect(saveSession).toHaveBeenCalledWith(undefined, 'refreshed-session');
		expect(response.headers.get('set-cookie')).toContain(
			'__Host-wos_session=refreshed'
		);
	});
});
