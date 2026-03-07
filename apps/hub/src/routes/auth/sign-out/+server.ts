import { authKit } from '@workos/authkit-sveltekit';
import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSignOutPostHandler } from '$lib/auth/sign-out-handler.js';
import { getValidatedWorkosEnv } from '$lib/server/workos-security.js';

let postHandler: ReturnType<typeof createSignOutPostHandler> | null = null;

function getPostHandler(): ReturnType<typeof createSignOutPostHandler> {
	if (postHandler) {
		return postHandler;
	}

	const workosEnv = getValidatedWorkosEnv(env);
	const signOut = async (event: Parameters<typeof authKit.signOut>[0]) => {
		if (
			env.NODE_ENV === 'test' &&
			event.request.headers.get('cookie')?.includes('wos-session=test-fixture')
		) {
			event.cookies.delete('wos-session', {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: true
			});
			throw redirect(302, '/');
		}
		return authKit.signOut(event);
	};

	postHandler = createSignOutPostHandler({
		signOut,
		expectedOrigin: workosEnv.origin
	});
	return postHandler;
}

export const POST: RequestHandler = (event) => getPostHandler()(event);
