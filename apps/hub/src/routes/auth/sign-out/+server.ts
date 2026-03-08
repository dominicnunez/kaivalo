import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { createSignOutPostHandler } from '$lib/auth/sign-out-handler.js';
import { getValidatedWorkosEnv } from '$lib/server/workos-security.js';
import { getAuthRouteHandlers } from '$lib/server/authkit-runtime.js';
import { shouldIncludeErrorMessage } from '$lib/server/error-diagnostics.js';
import { getTrustedWorkosAuthOrigin } from '$lib/server/auth-origin-policy.js';

let postHandler: ReturnType<typeof createSignOutPostHandler> | null = null;

function getPostHandler(): ReturnType<typeof createSignOutPostHandler> {
	if (postHandler) {
		return postHandler;
	}

	const workosEnv = getValidatedWorkosEnv(env);
	const { signOut } = getAuthRouteHandlers();

	postHandler = createSignOutPostHandler({
		signOut,
		expectedOrigin: workosEnv.origin,
		allowedRedirectOrigins: [getTrustedWorkosAuthOrigin(workosEnv)],
		includeMessageInLogs: shouldIncludeErrorMessage(env)
	});
	return postHandler;
}

export const POST: RequestHandler = (event) => getPostHandler()(event);
