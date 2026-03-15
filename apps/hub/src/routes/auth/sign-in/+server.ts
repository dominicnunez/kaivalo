import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { createSignInGetHandler } from '$lib/auth/sign-in-handler.ts';
import { shouldIncludeErrorMessage } from '$lib/server/error-diagnostics.ts';
import { getTrustedWorkosAuthOrigin } from '$lib/server/auth-origin-policy.ts';
import { getValidatedWorkosEnv } from '$lib/server/workos-security.ts';
import { createConfiguredWorkosSignInStart } from '$lib/server/workos-auth.ts';

let getHandler: ReturnType<typeof createSignInGetHandler> | null = null;

function getSignInHandler(): ReturnType<typeof createSignInGetHandler> {
	if (getHandler) {
		return getHandler;
	}

	const workosEnv = getValidatedWorkosEnv(env);
	getHandler = createSignInGetHandler({
		beginSignIn: createConfiguredWorkosSignInStart(workosEnv),
		expectedOrigin: workosEnv.origin,
		authErrorSigningSecret: workosEnv.authErrorSigningSecret,
		allowedRedirectOrigins: [getTrustedWorkosAuthOrigin(workosEnv)],
		includeMessageInLogs: shouldIncludeErrorMessage(env)
	});
	return getHandler;
}

export const GET: RequestHandler = (event) => getSignInHandler()(event);
