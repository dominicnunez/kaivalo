import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { createSignOutPostHandler } from '$lib/auth/sign-out-handler.js';
import { getValidatedWorkosEnv } from '$lib/server/workos-security.js';
import { getAuthRouteHandlers } from '$lib/server/authkit-runtime.js';

let postHandler: ReturnType<typeof createSignOutPostHandler> | null = null;

function getPostHandler(): ReturnType<typeof createSignOutPostHandler> {
	if (postHandler) {
		return postHandler;
	}

	const workosEnv = getValidatedWorkosEnv(env);
	const { signOut } = getAuthRouteHandlers(env);

	postHandler = createSignOutPostHandler({
		signOut,
		expectedOrigin: workosEnv.origin
	});
	return postHandler;
}

export const POST: RequestHandler = (event) => getPostHandler()(event);
