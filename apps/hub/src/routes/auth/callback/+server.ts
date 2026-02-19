import { authKit } from '@workos/authkit-sveltekit';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	try {
		const handler = authKit.handleCallback();
		return await handler(event);
	} catch (err) {
		console.error('Auth callback failed:', err);
		redirect(302, '/?error=auth');
	}
};
