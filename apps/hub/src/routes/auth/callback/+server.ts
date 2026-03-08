import { isRedirect, isHttpError } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { createAuthCallbackGetHandler } from '$lib/auth/callback-handler.js';
import { getAuthRouteHandlers } from '$lib/server/authkit-runtime.js';
import { shouldIncludeErrorMessage } from '$lib/server/error-diagnostics.js';

const getHandler = createAuthCallbackGetHandler({
	handleCallback: () => getAuthRouteHandlers().handleCallback(),
	isRedirect,
	isHttpError,
	cookiePassword: env.WORKOS_COOKIE_PASSWORD ?? '',
	includeMessageInLogs: shouldIncludeErrorMessage(env)
});

export const GET: RequestHandler = (event) => getHandler(event);
