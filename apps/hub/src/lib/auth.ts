import { authKit } from '@workos/authkit-sveltekit';
import { redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Require authentication for a +page.server.ts or +layout.server.ts load function.
 * Redirects unauthenticated users to the WorkOS sign-in page.
 *
 * Usage in a +page.server.ts:
 *
 *   import { requireAuth } from '$lib/auth';
 *   import type { PageServerLoad } from './$types';
 *
 *   export const load: PageServerLoad = async (event) => {
 *     const user = await requireAuth(event);
 *     return { user };
 *   };
 */
export async function requireAuth(event: RequestEvent) {
	const user = await authKit.getUser(event);

	if (!user) {
		const pathname = event.url.pathname;
		const returnTo = pathname.startsWith('/') && !pathname.startsWith('//') ? pathname : '/';
		const signInUrl = await authKit.getSignInUrl({ returnTo });
		redirect(302, signInUrl);
	}

	return user;
}

// Re-export authKit for convenience — avoids importing from two places
export { authKit } from '@workos/authkit-sveltekit';
