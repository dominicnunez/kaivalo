import { error, redirect } from '@sveltejs/kit';
import { AUTH_ERROR_MESSAGE } from './auth-error-query-shared.ts';

const PRIVATE_NO_STORE_CACHE_CONTROL = 'private, no-store';

type LayoutAuthError = {
	message: string;
	incidentId: string | null;
};

type LayoutAuthState<User> = {
	user: User | null;
	signInUrl: string | null;
	authError: LayoutAuthError | null;
};

type HeaderSettingEvent = {
	setHeaders?: ((headers: Record<string, string>) => void) | undefined;
};

export function requireAuthenticatedLayoutUser<User>(
	state: LayoutAuthState<User>,
	event?: HeaderSettingEvent
): User {
	if (state.user) {
		return state.user;
	}

	if (state.authError) {
		throw error(503, {
			message: state.authError.message,
			...(state.authError.incidentId === null
				? {}
				: { incidentId: state.authError.incidentId })
		});
	}

	if (state.signInUrl) {
		event?.setHeaders?.({
			'cache-control': PRIVATE_NO_STORE_CACHE_CONTROL
		});
		throw redirect(303, state.signInUrl);
	}

	throw error(503, AUTH_ERROR_MESSAGE);
}
