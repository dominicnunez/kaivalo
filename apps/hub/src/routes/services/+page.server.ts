import type { PageServerLoad } from './$types';
import { getLauncherServices } from '$lib/services/registry.ts';
import { requireAuthenticatedLayoutUser } from '$lib/auth/layout-access.ts';

export const load: PageServerLoad = async (event) => {
	const parentData = await event.parent();
	requireAuthenticatedLayoutUser(parentData);

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
