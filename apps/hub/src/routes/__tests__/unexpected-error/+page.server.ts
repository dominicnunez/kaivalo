import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ request }) => {
	if (env.NODE_ENV !== 'test') {
		error(404, 'Not found');
	}

	if (request.headers.get('x-kaivalo-test-unhandled-error') !== '1') {
		error(404, 'Not found');
	}

	throw new Error('Forced unhandled error for integration test');
};
