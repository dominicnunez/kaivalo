import type { RequestHandler } from './$types';
import { sanitizeAvatarUrl } from '$lib/server/avatar-url.ts';

const AVATAR_CACHE_CONTROL =
	'public, max-age=300, stale-while-revalidate=86400';

function getAvatarContentType(upstream: Response): string | null {
	const contentType = upstream.headers.get('content-type')?.trim() ?? '';
	return contentType.toLowerCase().startsWith('image/') ? contentType : null;
}

export const GET: RequestHandler = async ({ url, fetch }) => {
	const source = sanitizeAvatarUrl(url.searchParams.get('source'));
	if (!source) {
		return new Response('Not found', {
			status: 404,
			headers: {
				'cache-control': 'private, no-store'
			}
		});
	}

	let upstream: Response;
	try {
		upstream = await fetch(source, {
			headers: {
				accept: 'image/*'
			},
			redirect: 'error'
		});
	} catch {
		return new Response('Bad gateway', {
			status: 502,
			headers: {
				'cache-control': 'private, no-store'
			}
		});
	}

	if (!upstream.ok) {
		return new Response('Bad gateway', {
			status: 502,
			headers: {
				'cache-control': 'private, no-store'
			}
		});
	}

	const contentType = getAvatarContentType(upstream);
	if (!contentType) {
		return new Response('Bad gateway', {
			status: 502,
			headers: {
				'cache-control': 'private, no-store'
			}
		});
	}

	const headers = new Headers({
		'cache-control': AVATAR_CACHE_CONTROL,
		'content-type': contentType,
		'x-content-type-options': 'nosniff'
	});
	const contentLength = upstream.headers.get('content-length');
	if (contentLength) {
		headers.set('content-length', contentLength);
	}
	const etag = upstream.headers.get('etag');
	if (etag) {
		headers.set('etag', etag);
	}
	const lastModified = upstream.headers.get('last-modified');
	if (lastModified) {
		headers.set('last-modified', lastModified);
	}

	return new Response(upstream.body, {
		status: 200,
		headers
	});
};
