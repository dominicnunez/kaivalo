import { isRedirect, type Handle } from '@sveltejs/kit';
import {
	SessionEncryptionError,
	TokenRefreshError
} from '@workos/authkit-session';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
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
					'https://kaivalo.test/auth/callback?error=oauth_code=secret',
					{
						accept: 'text/html'
					}
				) as never
			)
		).rejects.toSatisfy((caught: unknown) => {
			expect(isRedirect(caught)).toBe(true);
			if (!isRedirect(caught)) {
				return false;
			}

			expect(caught.status).toBe(302);
			expect(caught.location).toBe('/auth/error?code=AUTH_ERROR');
			return true;
		});

		expect(handleCallback).not.toHaveBeenCalled();
		expect(consoleError).not.toHaveBeenCalled();
		consoleError.mockRestore();
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
