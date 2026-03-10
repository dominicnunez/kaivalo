import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	AVATAR_FETCH_TIMEOUT_MS,
	AVATAR_MAX_RESPONSE_BYTES
} from '$lib/server/avatar-proxy.ts';
import { GET } from './+server';

afterEach(() => {
	vi.restoreAllMocks();
});

function createTrackedUpstreamResponse(
	headers: HeadersInit,
	status = 200
): { response: Response; cancelSpy: ReturnType<typeof vi.fn> } {
	const cancelSpy = vi.fn();
	const stream = new ReadableStream<Uint8Array>({
		cancel(reason) {
			cancelSpy(reason);
		}
	});

	return {
		response: new Response(stream, {
			status,
			headers
		}),
		cancelSpy
	};
}

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
						'cache-control':
							'public, max-age=600, stale-while-revalidate=86400',
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

	it('defaults successful avatar responses to private no-store when upstream cache policy is absent', async () => {
		const fetch = vi.fn(
			async () =>
				new Response('image-bytes', {
					status: 200,
					headers: {
						'content-type': 'image/png',
						'content-length': '11'
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

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it('preserves stricter upstream cache lifetimes instead of widening them', async () => {
		const fetch = vi.fn(
			async () =>
				new Response('image-bytes', {
					status: 200,
					headers: {
						'cache-control': 'public, max-age=60, stale-while-revalidate=30',
						'content-type': 'image/png',
						'content-length': '11'
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

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe(
			'public, max-age=60, stale-while-revalidate=30'
		);
	});

	it('does not widen restrictive upstream cache directives', async () => {
		const fetch = vi.fn(
			async () =>
				new Response('image-bytes', {
					status: 200,
					headers: {
						'cache-control': 'private, max-age=60',
						'content-type': 'image/png',
						'content-length': '11'
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

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it('rejects non-image upstream responses and logs content-type failures', async () => {
		const { response: upstream, cancelSpy } = createTrackedUpstreamResponse({
			'content-type': 'text/html'
		});
		const fetch = vi.fn(async () => upstream);
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

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
		expect(cancelSpy).toHaveBeenCalledOnce();
		expect(errorSpy).toHaveBeenCalledWith(
			'Avatar proxy request failed',
			expect.objectContaining({
				incidentId: expect.stringMatching(/^avatar_[0-9a-f-]+$/),
				requestId: 'missing',
				pathname: '/avatar',
				method: 'GET',
				sourceHost: 'avatars.githubusercontent.com',
				failureClass: 'content-type',
				responseStatus: 502,
				upstreamContentType: 'text/html',
				errorCode: 'AVATAR_PROXY_FAILURE'
			})
		);
	});

	it('cancels non-ok upstream avatar responses before returning bad gateway and logs status failures', async () => {
		const { response: upstream, cancelSpy } = createTrackedUpstreamResponse(
			{
				'content-type': 'image/png'
			},
			404
		);
		const fetch = vi.fn(async () => upstream);
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

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
		expect(cancelSpy).toHaveBeenCalledOnce();
		expect(errorSpy).toHaveBeenCalledWith(
			'Avatar proxy request failed',
			expect.objectContaining({
				incidentId: expect.stringMatching(/^avatar_[0-9a-f-]+$/),
				requestId: 'missing',
				sourceHost: 'avatars.githubusercontent.com',
				failureClass: 'status',
				responseStatus: 502,
				upstreamStatus: 404,
				errorCode: 'AVATAR_PROXY_FAILURE'
			})
		);
	});

	it('rejects svg avatar responses from trusted upstream hosts', async () => {
		const fetch = vi.fn(
			async () =>
				new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
					status: 200,
					headers: {
						'content-type': 'image/svg+xml'
					}
				})
		);
		vi.spyOn(console, 'error').mockImplementation(() => {});

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

	it('returns a controlled gateway failure when the upstream fetch throws and logs the fetch context', async () => {
		const fetch = vi.fn(async () => {
			throw new Error('socket hang up');
		});
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const response = await GET({
			request: new Request(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1',
				{
					headers: {
						'x-request-id': 'bad request/+trace'
					}
				}
			),
			url: new URL(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
			),
			fetch
		} as never);

		expect(response.status).toBe(502);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(errorSpy).toHaveBeenCalledWith(
			'Avatar proxy request failed',
			expect.objectContaining({
				incidentId: expect.stringMatching(/^avatar_[0-9a-f-]+$/),
				requestId: 'bad_request__trace',
				pathname: '/avatar',
				method: 'GET',
				sourceHost: 'avatars.githubusercontent.com',
				failureClass: 'fetch',
				responseStatus: 502,
				errorCode: 'AVATAR_PROXY_FAILURE',
				errorName: 'Error',
				errorMessage: 'socket hang up'
			})
		);
	});

	it('fails fast when the upstream avatar fetch exceeds the timeout', async () => {
		const controller = new AbortController();
		const originalTimeout = AbortSignal.timeout;
		vi.spyOn(console, 'error').mockImplementation(() => {});
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

	it('returns gateway timeout when the upstream body stalls after headers arrive and logs stream failures', async () => {
		const chunk = new Uint8Array([1, 2, 3]);
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
		expect(errorSpy).toHaveBeenCalledWith(
			'Avatar proxy request failed',
			expect.objectContaining({
				incidentId: expect.stringMatching(/^avatar_[0-9a-f-]+$/),
				requestId: 'missing',
				sourceHost: 'avatars.githubusercontent.com',
				failureClass: 'stream',
				responseStatus: 504,
				errorCode: 'AVATAR_PROXY_FAILURE',
				errorName: 'TimeoutError',
				errorMessage: 'Timed out'
			})
		);
	});

	it('passes client validators upstream and preserves successful 304 revalidation', async () => {
		const fetch = vi.fn(
			async () =>
				new Response(null, {
					status: 304,
					headers: {
						'cache-control': 'public, max-age=60, stale-while-revalidate=30',
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
			'public, max-age=60, stale-while-revalidate=30'
		);
		expect(response.headers.get('etag')).toBe('"avatar-2"');
	});

	it('rejects oversized avatar responses before proxying the body', async () => {
		const { response: upstream, cancelSpy } = createTrackedUpstreamResponse({
			'content-type': 'image/png',
			'content-length': String(AVATAR_MAX_RESPONSE_BYTES + 1)
		});
		const fetch = vi.fn(async () => upstream);
		vi.spyOn(console, 'error').mockImplementation(() => {});

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
		expect(cancelSpy).toHaveBeenCalledOnce();
	});

	it('rejects streamed avatar responses that exceed the byte limit and logs size failures', async () => {
		const chunk = new Uint8Array(AVATAR_MAX_RESPONSE_BYTES / 2 + 1);
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
		expect(errorSpy).toHaveBeenCalledWith(
			'Avatar proxy request failed',
			expect.objectContaining({
				incidentId: expect.stringMatching(/^avatar_[0-9a-f-]+$/),
				requestId: 'missing',
				sourceHost: 'avatars.githubusercontent.com',
				failureClass: 'size',
				responseStatus: 502,
				errorCode: 'AVATAR_PROXY_FAILURE',
				errorName: 'AvatarResponseSizeError',
				errorMessage: 'Avatar response exceeds maximum allowed size'
			})
		);
	});
});
