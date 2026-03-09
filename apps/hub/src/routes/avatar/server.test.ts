import { describe, expect, it, vi } from 'vitest';

import {
	AVATAR_FETCH_TIMEOUT_MS,
	AVATAR_MAX_RESPONSE_BYTES
} from '$lib/server/avatar-proxy.ts';
import { GET } from './+server';

describe('avatar proxy route', () => {
	it('rejects untrusted avatar sources before fetching', async () => {
		const fetch = vi.fn();

		const response = await GET({
			request: new Request(
				'https://kaivalo.test/avatar?source=https://attacker.test/a.png'
			),
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
			request: new Request(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1?token=signed#tracker'
			),
			url: new URL(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1?token=signed#tracker'
			),
			fetch
		} as never);

		expect(fetch).toHaveBeenCalledWith(
			'https://avatars.githubusercontent.com/u/1',
			expect.objectContaining({
				headers: {
					accept: 'image/*'
				},
				redirect: 'error',
				signal: expect.any(AbortSignal)
			})
		);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/png');
		expect(await response.text()).toBe('image-bytes');
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
			request: new Request(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
			),
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
			request: new Request(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
			),
			url: new URL(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
			),
			fetch
		} as never);

		expect(response.status).toBe(502);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it('fails fast when the upstream avatar fetch exceeds the timeout', async () => {
		const controller = new AbortController();
		const originalTimeout = AbortSignal.timeout;
		const fetch = vi.fn(
			(_input: string | URL | Request, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener(
						'abort',
						() => reject(new DOMException('Timed out', 'TimeoutError')),
						{ once: true }
					);
					queueMicrotask(() =>
						controller.abort(new DOMException('Timed out', 'TimeoutError'))
					);
				})
		);
		AbortSignal.timeout = vi.fn(() => controller.signal);

		try {
			const response = await GET({
				request: new Request(
					'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
				),
				url: new URL(
					'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
				),
				fetch
			} as never);

			expect(response.status).toBe(504);
			expect(AbortSignal.timeout).toHaveBeenCalledWith(AVATAR_FETCH_TIMEOUT_MS);
		} finally {
			AbortSignal.timeout = originalTimeout;
		}
	});

	it('returns gateway timeout when the upstream body stalls after headers arrive', async () => {
		const chunk = new Uint8Array([1, 2, 3]);
		const fetch = vi.fn(async () => {
			let readCount = 0;
			const stream = new ReadableStream<Uint8Array>({
				pull(controller) {
					readCount += 1;
					if (readCount === 1) {
						controller.enqueue(chunk);
						return;
					}

					throw new DOMException('Timed out', 'TimeoutError');
				}
			});

			return new Response(stream, {
				status: 200,
				headers: {
					'content-type': 'image/png'
				}
			});
		});

		const response = await GET({
			request: new Request(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
			),
			url: new URL(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
			),
			fetch
		} as never);

		expect(response.status).toBe(504);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		await expect(response.text()).resolves.toBe('Gateway timeout');
	});

	it('passes client validators upstream and preserves successful 304 revalidation', async () => {
		const fetch = vi.fn(
			async () =>
				new Response(null, {
					status: 304,
					headers: {
						etag: '"avatar-2"',
						'last-modified': 'Mon, 03 Mar 2025 12:00:00 GMT'
					}
				})
		);

		const response = await GET({
			request: new Request(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1',
				{
					headers: {
						'if-none-match': '"avatar-2"',
						'if-modified-since': 'Mon, 03 Mar 2025 12:00:00 GMT'
					}
				}
			),
			url: new URL(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
			),
			fetch
		} as never);

		expect(fetch).toHaveBeenCalledWith(
			'https://avatars.githubusercontent.com/u/1',
			expect.objectContaining({
				headers: {
					accept: 'image/*',
					'if-none-match': '"avatar-2"',
					'if-modified-since': 'Mon, 03 Mar 2025 12:00:00 GMT'
				}
			})
		);
		expect(response.status).toBe(304);
		expect(response.headers.get('cache-control')).toBe(
			'public, max-age=300, stale-while-revalidate=86400'
		);
		expect(response.headers.get('etag')).toBe('"avatar-2"');
	});

	it('rejects oversized avatar responses before proxying the body', async () => {
		const body = 'x'.repeat(AVATAR_MAX_RESPONSE_BYTES + 1);
		const fetch = vi.fn(
			async () =>
				new Response(body, {
					status: 200,
					headers: {
						'content-type': 'image/png',
						'content-length': String(body.length)
					}
				})
		);

		const response = await GET({
			request: new Request(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
			),
			url: new URL(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
			),
			fetch
		} as never);

		expect(response.status).toBe(502);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it('rejects streamed avatar responses that exceed the byte limit', async () => {
		const chunk = new Uint8Array(AVATAR_MAX_RESPONSE_BYTES / 2 + 1);
		const fetch = vi.fn(async () => {
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(chunk);
					controller.enqueue(chunk);
					controller.close();
				}
			});

			return new Response(stream, {
				status: 200,
				headers: {
					'content-type': 'image/png'
				}
			});
		});

		const response = await GET({
			request: new Request(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
			),
			url: new URL(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
			),
			fetch
		} as never);

		expect(response.status).toBe(502);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});
});
