import { authKit } from '@workos/authkit-sveltekit';
import { isRedirect, isHttpError, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	try {
		const handler = authKit.handleCallback();
		return await handler(event);
	} catch (err) {
		if (isRedirect(err) || isHttpError(err)) throw err;
		console.error('Auth callback failed:', err instanceof Error ? err.message : 'unknown error');
		redirect(302, '/?error=auth');
	}
};
