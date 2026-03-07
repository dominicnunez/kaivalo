import { authKit } from '@workos/authkit-sveltekit';
import { isRedirect, isHttpError } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { createAuthCallbackGetHandler } from '$lib/auth/callback-handler.js';

const getHandler = createAuthCallbackGetHandler({
	handleCallback: () => authKit.handleCallback(),
	isRedirect,
	isHttpError,
	cookiePassword: env.WORKOS_COOKIE_PASSWORD ?? ''
});

export const GET: RequestHandler = (event) => getHandler(event);
