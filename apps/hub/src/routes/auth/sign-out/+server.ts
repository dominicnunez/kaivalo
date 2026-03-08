import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { createSignOutPostHandler } from '$lib/auth/sign-out-handler.js';
import { getValidatedWorkosEnv } from '$lib/server/workos-security.js';
import { shouldIncludeErrorMessage } from '$lib/server/error-diagnostics.js';
import { getTrustedWorkosAuthOrigin } from '$lib/server/auth-origin-policy.js';
import { authKit } from '@workos/authkit-sveltekit';

let postHandler: ReturnType<typeof createSignOutPostHandler> | null = null;

function getPostHandler(): ReturnType<typeof createSignOutPostHandler> {
	if (postHandler) {
		return postHandler;
	}

	const workosEnv = getValidatedWorkosEnv(env);
	postHandler = createSignOutPostHandler({
		signOut: authKit.signOut,
		expectedOrigin: workosEnv.origin,
		allowedRedirectOrigins: [getTrustedWorkosAuthOrigin(workosEnv)],
		includeMessageInLogs: shouldIncludeErrorMessage(env)
	});
	return postHandler;
}

export const POST: RequestHandler = (event) => getPostHandler()(event);
