import { isRedirect, isHttpError } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { createAuthCallbackGetHandler } from '$lib/auth/callback-handler.ts';
import { shouldIncludeErrorMessage } from '$lib/server/error-diagnostics.ts';
import { getValidatedWorkosEnv } from '$lib/server/workos-security.ts';
import { authKit } from '@workos/authkit-sveltekit';

let getHandler: ReturnType<typeof createAuthCallbackGetHandler> | null = null;

function getCallbackHandler(): ReturnType<typeof createAuthCallbackGetHandler> {
	if (getHandler) {
		return getHandler;
	}

	const workosEnv = getValidatedWorkosEnv(env);
	getHandler = createAuthCallbackGetHandler({
		handleCallback: () => authKit.handleCallback(),
		isRedirect,
		isHttpError,
		cookiePassword: workosEnv.cookiePassword,
		expectedOrigin: workosEnv.origin,
		includeMessageInLogs: shouldIncludeErrorMessage(env)
	});
	return getHandler;
}

export const GET: RequestHandler = (event) => getCallbackHandler()(event);
