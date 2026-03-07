import { authKit } from '@workos/authkit-sveltekit';
import { isRedirect, isHttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAuthCallbackGetHandler } from '$lib/auth/callback-handler.js';

const getHandler = createAuthCallbackGetHandler({
	handleCallback: () => authKit.handleCallback(),
	isRedirect,
	isHttpError
});

export const GET: RequestHandler = (event) => getHandler(event);
