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
	it('logs upstream and cause codes for unexpected sign-out failures', async () => {
		const logError = vi.fn();
		const handler = createSignOutPostHandler({
			expectedOrigin: 'https://kaivalo.test',
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
