import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import {
	AUTH_ERROR_TIMESTAMP_QUERY_NAME,
	readVerifiedAuthError
} from './auth-error-query.ts';
import { createSignInGetHandler } from './sign-in-handler.ts';

const AUTH_ERROR_SIGNING_SECRET = 'cd'.repeat(32);
const EXPECTED_ORIGIN = 'https://kaivalo.test';

function createEvent(
	headers: HeadersInit = {},
	requestUrl = 'https://kaivalo.test/auth/sign-in'
) {
	return {
		request: new Request(requestUrl, {
			method: 'GET',
			headers
		}),
		url: new URL(requestUrl)
	} as never;
}

describe('sign-in handler', () => {
	it('returns a 503 for non-browser failures with normalized request ids and sanitized logs', async () => {
		const logError = vi.fn();
		const cause = Object.assign(
			new Error('authorization: Bearer cause-secret-token'),
			{
				code: 'ETIMEDOUT'
			}
		);
		const signInError = Object.assign(
			new Error('client_secret=top-secret-value'),
			{
				code: 'WORKOS_SIGNIN_FAILED',
				cause
			}
		);
		const handler = createSignInGetHandler({
			getSignInUrl: vi.fn(async () => {
				throw signInError;
			}),
			expectedOrigin: EXPECTED_ORIGIN,
			authErrorSigningSecret: AUTH_ERROR_SIGNING_SECRET,
			logError
		});

		await expect(
			handler(
				createEvent({
					accept: 'application/json',
					'x-request-id': 'bad value/+extra@chars'
				})
			)
		).rejects.toSatisfy((caught: unknown) => {
			expect(isHttpError(caught)).toBe(true);
			if (!isHttpError(caught)) {
				return false;
			}

			expect(caught.status).toBe(503);
			expect(caught.body.message).toMatch(
				/^Sign-in failed\. Reference: authsign_[0-9a-f-]+$/
			);
			return true;
		});

		expect(logError).toHaveBeenCalledOnce();
		expect(logError).toHaveBeenCalledWith(
			'Sign-in failed',
			expect.objectContaining({
				requestId: 'bad_value__extra_chars',
				method: 'GET',
				pathname: '/auth/sign-in',
				errorName: 'Error',
				errorCode: 'AUTH_SIGN_IN_UNEXPECTED_FAILURE',
				errorUpstreamCode: 'WORKOS_SIGNIN_FAILED',
				errorCauseName: 'Error',
				errorCauseCode: 'ETIMEDOUT',
				incidentId: expect.stringMatching(/^authsign_[0-9a-f-]+$/)
			})
		);

		const logContext = logError.mock.calls[0]?.[1];
		expect(logContext).toBeTruthy();
		expect(logContext).not.toHaveProperty('errorMessage');
		expect(logContext).not.toHaveProperty('errorCauseMessage');
	});

	it('redirects browser failures with a signed auth error and redacted log messages', async () => {
		const logError = vi.fn();
		const cause = Object.assign(
			new Error('authorization: Bearer browser-secret-token'),
			{
				code: 'ETIMEDOUT'
			}
		);
		const signInError = Object.assign(
			new Error('client_secret=browser-secret-value'),
			{
				code: 'WORKOS_SIGNIN_FAILED',
				cause
			}
		);
		const handler = createSignInGetHandler({
			getSignInUrl: vi.fn(async () => {
				throw signInError;
			}),
			expectedOrigin: EXPECTED_ORIGIN,
			authErrorSigningSecret: AUTH_ERROR_SIGNING_SECRET,
			includeMessageInLogs: true,
			logError
		});

		try {
			await handler(
				createEvent({
					accept: 'text/html',
					'sec-fetch-mode': 'navigate',
					'x-request-id': 'request-123'
				})
			);
			throw new Error('expected sign-in handler to redirect');
		} catch (thrown) {
			expect(isRedirect(thrown)).toBe(true);
			if (!isRedirect(thrown)) {
				throw thrown;
			}

			expect(thrown.status).toBe(303);
			const location = new URL(thrown.location, EXPECTED_ORIGIN);
			expect(location.pathname).toBe('/');
			expect(
				readVerifiedAuthError(location.searchParams, {
					secret: AUTH_ERROR_SIGNING_SECRET,
					now:
						Number(location.searchParams.get(AUTH_ERROR_TIMESTAMP_QUERY_NAME)) +
						1
				})
			).toEqual({
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: expect.stringMatching(/^authsign_[0-9a-f-]+$/)
			});
		}

		expect(logError).toHaveBeenCalledOnce();
		expect(logError).toHaveBeenCalledWith(
			'Sign-in failed',
			expect.objectContaining({
				requestId: 'request-123',
				method: 'GET',
				pathname: '/auth/sign-in',
				errorName: 'Error',
				errorCode: 'AUTH_SIGN_IN_UNEXPECTED_FAILURE',
				errorUpstreamCode: 'WORKOS_SIGNIN_FAILED',
				errorCauseName: 'Error',
				errorCauseCode: 'ETIMEDOUT',
				errorMessage: expect.stringContaining('[redacted]'),
				errorCauseMessage: expect.stringContaining('[redacted]'),
				incidentId: expect.stringMatching(/^authsign_[0-9a-f-]+$/)
			})
		);

		const logContext = logError.mock.calls[0]?.[1];
		expect(logContext).toBeTruthy();
		expect(logContext.errorMessage).not.toContain('browser-secret-value');
		expect(logContext.errorCauseMessage).not.toContain('browser-secret-token');
	});
});
