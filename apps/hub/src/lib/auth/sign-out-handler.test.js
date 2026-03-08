import { describe, expect, it, vi } from 'vitest';
import { createSignOutPostHandler } from './sign-out-handler.js';

function createEvent({
	url = 'https://kaivalo.test/auth/sign-out',
	method = 'POST',
	headers = {}
} = {}) {
	return {
		url: new URL(url),
		request: new Request(url, { method, headers })
	};
}

describe('createSignOutPostHandler', () => {
	it('allows redirect-like failures to the configured WorkOS logout origin', async () => {
		const handler = createSignOutPostHandler({
			expectedOrigin: 'https://kaivalo.test',
			allowedRedirectOrigins: ['https://api.workos.com'],
			signOut: async () => {
				throw {
					status: 302,
					location:
						'https://api.workos.com/user_management/sessions/logout?session_id=session_123&return_to=https%3A%2F%2Fkaivalo.test'
				};
			}
		});

		await expect(
			handler(
				/** @type {never} */ (
					createEvent({
						headers: {
							origin: 'https://kaivalo.test'
						}
					})
				)
			)
		).rejects.toMatchObject({
			status: 302,
			location:
				'https://api.workos.com/user_management/sessions/logout?session_id=session_123&return_to=https%3A%2F%2Fkaivalo.test'
		});
	});

	it('rejects redirect-like failures to untrusted external origins with a sanitized 503', async () => {
		const logError = vi.fn();
		const handler = createSignOutPostHandler({
			expectedOrigin: 'https://kaivalo.test',
			includeMessageInLogs: true,
			signOut: async () => {
				throw {
					status: 303,
					location: 'https://evil.test/phish'
				};
			},
			logError
		});

		await expect(
			handler(
				/** @type {never} */ (
					createEvent({
						headers: {
							origin: 'https://kaivalo.test',
							'x-request-id': 'redirect test'
						}
					})
				)
			)
		).rejects.toMatchObject({
			status: 503,
			body: expect.objectContaining({
				message: expect.stringMatching(/^Sign-out failed\. Reference: authso_/)
			})
		});

		expect(logError).toHaveBeenCalledWith(
			'Sign-out failed',
			expect.objectContaining({
				errorCode: 'AUTH_SIGN_OUT_UNEXPECTED_FAILURE',
				errorMessage: 'Sign-out produced an invalid redirect location',
				pathname: '/auth/sign-out',
				requestId: 'redirect_test'
			})
		);
	});

	it('logs upstream and cause codes for unexpected sign-out failures', async () => {
		const logError = vi.fn();
		const handler = createSignOutPostHandler({
			expectedOrigin: 'https://kaivalo.test',
			includeMessageInLogs: true,
			signOut: async () => {
				const cause = Object.assign(new Error('upstream detail'), {
					code: 'SESSION_DELETE_TIMEOUT'
				});
				throw Object.assign(new Error('sign-out failed'), {
					code: 'WORKOS_SIGNOUT_FAILED',
					cause
				});
			},
			logError
		});

		await expect(
			handler(
				/** @type {never} */ (
					createEvent({
						headers: {
							origin: 'https://kaivalo.test',
							'x-request-id': 'bad request + trace'
						}
					})
				)
			)
		).rejects.toMatchObject({
			status: 503,
			body: expect.objectContaining({
				message: expect.stringMatching(/^Sign-out failed\. Reference: authso_/)
			})
		});

		expect(logError).toHaveBeenCalledWith(
			'Sign-out failed',
			expect.objectContaining({
				errorCode: 'AUTH_SIGN_OUT_UNEXPECTED_FAILURE',
				errorMessage: 'sign-out failed',
				errorCauseMessage: 'upstream detail',
				errorUpstreamCode: 'WORKOS_SIGNOUT_FAILED',
				errorCauseCode: 'SESSION_DELETE_TIMEOUT',
				errorCauseName: 'Error',
				errorName: 'Error',
				pathname: '/auth/sign-out',
				requestId: 'bad_request___trace'
			})
		);
	});
});
