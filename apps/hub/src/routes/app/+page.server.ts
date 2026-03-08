import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getLauncherServices } from '$lib/services/registry.ts';

export const load: PageServerLoad = async (event) => {
	const parentData = await event.parent();
	if (!parentData.user) {
		if (parentData.signInUrl) {
			throw redirect(303, parentData.signInUrl);
		}

		throw error(503, 'Sign-in is temporarily unavailable.');
	}

	return {
		meta: {
			title: 'Kaivalo | Service Launcher',
			description:
				'Launch the Kaivalo services available on your account from one authenticated dashboard.'
		},
		...getLauncherServices()
	};
};
