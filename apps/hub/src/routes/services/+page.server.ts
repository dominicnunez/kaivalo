import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getLauncherServices } from '$lib/services/registry.ts';

const PRIVATE_NO_STORE_CACHE_CONTROL = 'private, no-store';

export const load: PageServerLoad = async (event) => {
	const parentData = await event.parent();
	if (!parentData.user) {
		if (parentData.signInUrl) {
			if (typeof event.setHeaders === 'function') {
				event.setHeaders({
					'cache-control': PRIVATE_NO_STORE_CACHE_CONTROL
				});
			}
			throw redirect(303, parentData.signInUrl);
		}

		throw error(503, 'Sign-in is temporarily unavailable.');
	}

	return {
		meta: {
			title: 'Kaivalo | Services',
			description:
				'Open the Kaivalo services available on your account from one authenticated launcher.'
		},
		currentYear: new Date().getFullYear(),
		...getLauncherServices()
	};
};
