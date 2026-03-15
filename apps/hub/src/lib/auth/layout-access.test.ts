import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { AUTH_ERROR_MESSAGE } from './auth-error-query-shared.ts';
import { requireAuthenticatedLayoutUser } from './layout-access.ts';

type LayoutUser = {
	id: string;
	email: string;
};

function createState(
	overrides: Partial<{
		user: LayoutUser | null;
		signInUrl: string | null;
		authError: {
			message: string;
			incidentId: string | null;
		} | null;
	}> = {}
) {
	return {
		user: null,
		signInUrl: null,
		authError: null,
		...overrides
	};
}

function expectServiceError(
	callback: () => unknown,
	expectedBody: {
		message: string;
		incidentId?: string;
	}
) {
	try {
		callback();
		expect.unreachable('expected service error');
	} catch (caught) {
		expect(isHttpError(caught)).toBe(true);
		if (!isHttpError(caught)) {
			return;
		}

		expect(caught.status).toBe(503);
		expect(caught.body).toEqual(expectedBody);
	}
}

function expectRedirectToSignIn(callback: () => unknown) {
	try {
		callback();
		expect.unreachable('expected redirect');
	} catch (caught) {
		expect(isRedirect(caught)).toBe(true);
		if (!isRedirect(caught)) {
			return;
		}

		expect(caught.status).toBe(303);
		expect(caught.location).toBe('/auth/sign-in');
	}
}

describe('requireAuthenticatedLayoutUser', () => {
	it('returns the authenticated user without mutating response headers', () => {
		const setHeaders = vi.fn();
		const user = {
			id: 'user_123',
			email: 'kai@example.com'
		};

		expect(
			requireAuthenticatedLayoutUser(
				createState({
					user
				}),
				{ setHeaders }
			)
		).toBe(user);
		expect(setHeaders).not.toHaveBeenCalled();
	});

	it('throws a controlled service error when auth state already carries an auth error', () => {
		expectServiceError(
			() =>
				requireAuthenticatedLayoutUser(
					createState({
						authError: {
							message: 'Sign-in is temporarily unavailable.',
							incidentId: 'authlayout_123'
						},
						signInUrl: '/auth/sign-in'
					})
				),
			{
				message: 'Sign-in is temporarily unavailable.',
				incidentId: 'authlayout_123'
			}
		);
	});

	it('sets private no-store caching before redirecting to sign-in', () => {
		const setHeaders = vi.fn();

		expectRedirectToSignIn(() =>
			requireAuthenticatedLayoutUser(
				createState({
					signInUrl: '/auth/sign-in'
				}),
				{ setHeaders }
			)
		);
		expect(setHeaders).toHaveBeenCalledWith({
			'cache-control': 'private, no-store'
		});
	});

	it('fails closed when neither a user nor a sign-in redirect is available', () => {
		expectServiceError(() => requireAuthenticatedLayoutUser(createState()), {
			message: AUTH_ERROR_MESSAGE
		});
	});
});
