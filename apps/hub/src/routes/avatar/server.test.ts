import { describe, expect, it, vi } from 'vitest';

import { GET } from './+server';

describe('avatar proxy route', () => {
	it('rejects untrusted avatar sources before fetching', async () => {
		const fetch = vi.fn();

		const response = await GET({
			url: new URL(
				'https://kaivalo.test/avatar?source=https://attacker.test/a.png'
			),
			fetch
		} as never);

		expect(response.status).toBe(404);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('fetches trusted avatars through the first-party proxy', async () => {
		const fetch = vi.fn(
			async () =>
				new Response('image-bytes', {
					status: 200,
					headers: {
						'content-type': 'image/png',
						'content-length': '11',
						etag: '"avatar-1"'
					}
				})
		);

		const response = await GET({
			url: new URL(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1?token=signed#tracker'
			),
			fetch
		} as never);

		expect(fetch).toHaveBeenCalledWith(
			'https://avatars.githubusercontent.com/u/1',
			{
				headers: {
					accept: 'image/*'
				},
				redirect: 'error'
			}
		);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/png');
		expect(response.headers.get('cache-control')).toBe(
			'public, max-age=300, stale-while-revalidate=86400'
		);
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response.headers.get('etag')).toBe('"avatar-1"');
	});

	it('rejects non-image upstream responses', async () => {
		const fetch = vi.fn(
			async () =>
				new Response('oops', {
					status: 200,
					headers: {
						'content-type': 'text/html'
					}
				})
		);

		const response = await GET({
			url: new URL(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
			),
			fetch
		} as never);

		expect(response.status).toBe(502);
	});

	it('returns a controlled gateway failure when the upstream fetch throws', async () => {
		const fetch = vi.fn(async () => {
			throw new Error('socket hang up');
		});

		const response = await GET({
			url: new URL(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
			),
			fetch
		} as never);

		expect(response.status).toBe(502);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});
});
