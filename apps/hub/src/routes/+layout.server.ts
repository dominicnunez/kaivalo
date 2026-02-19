import { authKit } from '@workos/authkit-sveltekit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
	const user = await authKit.getUser(event);
	const signInUrl = user ? null : await authKit.getSignInUrl();

	return {
		user: user
			? {
					firstName: user.firstName,
					email: user.email,
					profilePictureUrl: user.profilePictureUrl
				}
			: null,
		signInUrl
	};
};
