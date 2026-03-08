import { authKit } from '@workos/authkit-sveltekit';

export function getAuthRouteHandlers() {
	return {
		handleCallback: authKit.handleCallback,
		signOut: authKit.signOut
	};
}
