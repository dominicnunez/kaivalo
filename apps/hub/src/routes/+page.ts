import type { PageLoad } from './$types';
import { getHomeMeta } from '$lib/seo/home-meta.js';

export const load: PageLoad = ({ url }) => {
	return {
		meta: getHomeMeta(url.origin)
	};
};
