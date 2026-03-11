import { error, redirect } from '@sveltejs/kit';
import { AUTH_ERROR_MESSAGE } from './auth-error-query-shared.ts';

type LayoutAuthError = {
	message: string;
	incidentId: string | null;
};

type LayoutAuthState<User> = {
	user: User | null;
	signInUrl: string | null;
	authError: LayoutAuthError | null;
};

export function requireAuthenticatedLayoutUser<User>(
	state: LayoutAuthState<User>
): User {
	if (state.user) {
		return state.user;
	}

	if (state.authError) {
		throw error(503, state.authError.message);
	}

	if (state.signInUrl) {
		throw redirect(303, state.signInUrl);
	}

	throw error(503, AUTH_ERROR_MESSAGE);
}
