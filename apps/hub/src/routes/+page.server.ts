import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';
import { getHomeMeta } from '$lib/seo/home-meta.js';
import { getValidatedWorkosEnv } from '$lib/server/workos-security.js';

export const load: PageServerLoad = () => {
	return {
		meta: getHomeMeta(getValidatedWorkosEnv(env).origin)
	};
};
