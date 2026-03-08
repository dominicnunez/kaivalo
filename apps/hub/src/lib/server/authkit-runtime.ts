import { authKit } from '@workos/authkit-sveltekit';

export function getAuthRouteHandlers() {
	return {
		handleCallback: () => authKit.handleCallback(),
		signOut: (event: Parameters<typeof authKit.signOut>[0]) =>
			authKit.signOut(event)
	};
}

export async function getAuthUser(
	event: Parameters<typeof authKit.getUser>[0]
) {
	return authKit.getUser(event);
}
