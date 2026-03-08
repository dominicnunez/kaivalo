import { isRedirect, isHttpError } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { createAuthCallbackGetHandler } from '$lib/auth/callback-handler.ts';
import { shouldIncludeErrorMessage } from '$lib/server/error-diagnostics.ts';
import { authKit } from '@workos/authkit-sveltekit';

const getHandler = createAuthCallbackGetHandler({
	handleCallback: () => authKit.handleCallback(),
	isRedirect,
	isHttpError,
	cookiePassword: env.WORKOS_COOKIE_PASSWORD ?? '',
	includeMessageInLogs: shouldIncludeErrorMessage(env)
});

export const GET: RequestHandler = (event) => getHandler(event);
