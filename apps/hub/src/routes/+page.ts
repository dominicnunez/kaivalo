import type { PageLoad } from './$types';
import { getHomeMeta } from '$lib/seo/home-meta.js';

export const load: PageLoad = () => {
	return {
		meta: getHomeMeta()
	};
};
