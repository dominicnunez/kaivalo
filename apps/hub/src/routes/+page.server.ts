import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';
import { getHomeMeta } from '$lib/seo/home-meta.ts';
import { getValidatedWorkosEnv } from '$lib/server/workos-security.ts';

export const load: PageServerLoad = () => {
	return {
		meta: getHomeMeta(getValidatedWorkosEnv(env).origin),
		currentYear: new Date().getFullYear()
	};
};
