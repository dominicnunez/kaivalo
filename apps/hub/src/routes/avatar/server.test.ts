import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	AVATAR_FETCH_TIMEOUT_MS,
	AVATAR_MAX_RESPONSE_BYTES
} from '$lib/server/avatar-proxy.ts';
import { createSlidingWindowRateLimiter } from '$lib/server/request-rate-limit.ts';
import { _createAvatarGetHandler } from './+server';

let GET: ReturnType<typeof _createAvatarGetHandler>;

beforeEach(() => {
	GET = _createAvatarGetHandler();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
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

function createAvatarEvent(
	fetch: typeof globalThis.fetch,
	requestUrl = 'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1',
	headers: HeadersInit = {},
	clientAddress = '203.0.113.10'
) {
	return {
		request: new Request(requestUrl, { headers }),
		url: new URL(requestUrl),
		fetch,
		getClientAddress: () => clientAddress
	} as never;
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

		const response = await GET(
			createAvatarEvent(
				fetch,
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1?token=signed#tracker'
			)
		);

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

		const response = await GET(createAvatarEvent(fetch));

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it.each([
		{
			name: 'preserves a zero browser lifetime instead of widening it from s-maxage',
			upstreamCacheControl: 'public, max-age=0, s-maxage=600',
			expectedCacheControl: 'public, max-age=0'
		},
		{
			name: 'does not synthesize browser caching from a shared-cache-only lifetime',
			upstreamCacheControl: 'public, s-maxage=600',
			expectedCacheControl: 'private, no-store'
		}
	])('$name', async ({ upstreamCacheControl, expectedCacheControl }) => {
		const fetch = vi.fn(
			async () =>
				new Response('image-bytes', {
					status: 200,
					headers: {
						'cache-control': upstreamCacheControl,
						'content-type': 'image/png',
						'content-length': '11'
					}
				})
		);

		const response = await GET(createAvatarEvent(fetch));

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe(expectedCacheControl);
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

		const response = await GET(createAvatarEvent(fetch));

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe(
			'public, max-age=60, stale-while-revalidate=30'
		);
	});

	it('normalizes upstream no-cache directives to mandatory revalidation', async () => {
		const fetch = vi.fn(
			async () =>
				new Response('image-bytes', {
					status: 200,
					headers: {
						'cache-control': 'public, no-cache',
						'content-type': 'image/png',
						'content-length': '11'
					}
				})
		);

		const response = await GET(createAvatarEvent(fetch));

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe(
			'public, max-age=0, must-revalidate'
		);
	});

	it('preserves upstream must-revalidate directives on cacheable avatars', async () => {
		const fetch = vi.fn(
			async () =>
				new Response('image-bytes', {
					status: 200,
					headers: {
						'cache-control': 'public, max-age=600, must-revalidate',
						'content-type': 'image/png',
						'content-length': '11'
					}
				})
		);

		const response = await GET(createAvatarEvent(fetch));

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe(
			'public, max-age=300, must-revalidate'
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

		const response = await GET(createAvatarEvent(fetch));

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it('rejects non-image upstream responses and logs content-type failures', async () => {
		const { response: upstream, cancelSpy } = createTrackedUpstreamResponse({
			'content-type': 'text/html'
		});
		const fetch = vi.fn(async () => upstream);
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const response = await GET(createAvatarEvent(fetch));

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

		const response = await GET(createAvatarEvent(fetch));

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

		const response = await GET(createAvatarEvent(fetch));

		expect(response.status).toBe(502);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it('returns a controlled gateway failure when the upstream fetch throws and logs the fetch context', async () => {
		const fetch = vi.fn(async () => {
			throw new Error('socket hang up');
		});
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const response = await GET(
			createAvatarEvent(fetch, undefined, {
				'x-request-id': 'bad request/+trace'
			})
		);

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
			const response = await GET(createAvatarEvent(fetch));

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

		const response = await GET(createAvatarEvent(fetch));

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

		const response = await GET(
			createAvatarEvent(fetch, undefined, {
				'if-none-match': '"avatar-2"',
				'if-modified-since': 'Mon, 03 Mar 2025 12:00:00 GMT'
			})
		);

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

	it('does not overwrite cacheable avatar metadata on 304 responses that omit cache-control', async () => {
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

		const response = await GET(
			createAvatarEvent(fetch, undefined, {
				'if-none-match': '"avatar-2"'
			})
		);

		expect(response.status).toBe(304);
		expect(response.headers.has('cache-control')).toBe(false);
		expect(response.headers.get('etag')).toBe('"avatar-2"');
	});

	it('rejects oversized avatar responses before proxying the body', async () => {
		const { response: upstream, cancelSpy } = createTrackedUpstreamResponse({
			'content-type': 'image/png',
			'content-length': String(AVATAR_MAX_RESPONSE_BYTES + 1)
		});
		const fetch = vi.fn(async () => upstream);
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const response = await GET(createAvatarEvent(fetch));

		expect(response.status).toBe(502);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(cancelSpy).toHaveBeenCalledOnce();
	});

	it('reassembles chunked avatar responses with the exact response size', async () => {
		const chunks = [
			new TextEncoder().encode('image-'),
			new TextEncoder().encode('bytes'),
			new Uint8Array([33])
		];
		const fetch = vi.fn(async () => {
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					for (const chunk of chunks) {
						controller.enqueue(chunk);
					}
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

		const response = await GET(createAvatarEvent(fetch));

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('content-length')).toBe('12');
		expect(await response.text()).toBe('image-bytes!');
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

		const response = await GET(createAvatarEvent(fetch));

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

	it('rate limits repeated avatar fetches from the same client address', async () => {
		const GET = _createAvatarGetHandler({
			rateLimiter: createSlidingWindowRateLimiter({
				limit: 2,
				windowMs: 60_000,
				maxEntries: 128,
				now: () => 1_000
			})
		});
		const fetch = vi.fn(
			async () =>
				new Response('image-bytes', {
					status: 200,
					headers: {
						'cache-control': 'public, max-age=60',
						'content-type': 'image/png',
						'content-length': '11'
					}
				})
		);
		const event = {
			request: new Request(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
			),
			url: new URL(
				'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
			),
			fetch,
			getClientAddress: () => '203.0.113.10'
		} as never;

		expect((await GET(event)).status).toBe(200);
		expect((await GET(event)).status).toBe(200);

		const limited = await GET(event);

		expect(limited.status).toBe(429);
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(limited.headers.get('cache-control')).toBe('private, no-store');
		expect(limited.headers.get('retry-after')).toBe('60');
		await expect(limited.text()).resolves.toBe('Too many requests');
	});

	it('rejects new client addresses when the avatar limiter table is full', async () => {
		const GET = _createAvatarGetHandler({
			rateLimiter: createSlidingWindowRateLimiter({
				limit: 2,
				windowMs: 60_000,
				maxEntries: 1,
				now: () => 1_000
			})
		});
		const fetch = vi.fn(
			async () =>
				new Response('image-bytes', {
					status: 200,
					headers: {
						'cache-control': 'public, max-age=60',
						'content-type': 'image/png',
						'content-length': '11'
					}
				})
		);

		const createEvent = (clientAddress: string) =>
			({
				request: new Request(
					'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
				),
				url: new URL(
					'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
				),
				fetch,
				getClientAddress: () => clientAddress
			}) as never;

		expect((await GET(createEvent('203.0.113.10'))).status).toBe(200);

		const overflowed = await GET(createEvent('203.0.113.11'));

		expect(overflowed.status).toBe(429);
		expect(overflowed.headers.get('retry-after')).toBe('60');
		expect(fetch).toHaveBeenCalledTimes(1);
		expect((await GET(createEvent('203.0.113.10'))).status).toBe(200);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('shares quotas across equivalent normalized client addresses', async () => {
		let now = 1_000;
		const GET = _createAvatarGetHandler({
			rateLimiter: createSlidingWindowRateLimiter({
				limit: 2,
				windowMs: 60_000,
				maxEntries: 128,
				now: () => now
			})
		});
		const fetch = vi.fn(
			async () =>
				new Response('image-bytes', {
					status: 200,
					headers: {
						'cache-control': 'public, max-age=60',
						'content-type': 'image/png',
						'content-length': '11'
					}
				})
		);

		const createEvent = (clientAddress: string) =>
			({
				request: new Request(
					'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
				),
				url: new URL(
					'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
				),
				fetch,
				getClientAddress: () => clientAddress
			}) as never;

		expect((await GET(createEvent('::ffff:203.0.113.10'))).status).toBe(200);
		now += 1;
		expect((await GET(createEvent('203.0.113.10'))).status).toBe(200);
		now += 1;

		const limited = await GET(createEvent('203.0.113.10'));

		expect(limited.status).toBe(429);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('keeps avatar quotas independent for different client addresses', async () => {
		const GET = _createAvatarGetHandler({
			rateLimiter: createSlidingWindowRateLimiter({
				limit: 2,
				windowMs: 60_000,
				maxEntries: 128,
				now: () => 1_000
			})
		});
		const fetch = vi.fn(
			async () =>
				new Response('image-bytes', {
					status: 200,
					headers: {
						'cache-control': 'public, max-age=60',
						'content-type': 'image/png',
						'content-length': '11'
					}
				})
		);

		const createEvent = (clientAddress: string) =>
			({
				request: new Request(
					'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
				),
				url: new URL(
					'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
				),
				fetch,
				getClientAddress: () => clientAddress
			}) as never;

		expect((await GET(createEvent('203.0.113.10'))).status).toBe(200);
		expect((await GET(createEvent('203.0.113.10'))).status).toBe(200);
		expect((await GET(createEvent('203.0.113.11'))).status).toBe(200);
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it('rate limits proxied avatar requests by the trusted forwarded client address', async () => {
		vi.stubEnv('TRUST_X_FORWARDED_PROTO', 'true');
		vi.stubEnv('TRUSTED_PROXY_IPS', '203.0.113.1,203.0.113.2');

		let now = 1_000;
		const GET = _createAvatarGetHandler({
			rateLimiter: createSlidingWindowRateLimiter({
				limit: 2,
				windowMs: 60_000,
				maxEntries: 128,
				now: () => now
			})
		});
		const fetch = vi.fn(
			async () =>
				new Response('image-bytes', {
					status: 200,
					headers: {
						'cache-control': 'public, max-age=60',
						'content-type': 'image/png',
						'content-length': '11'
					}
				})
		);
		const createEvent = (forwardedFor: string) =>
			({
				request: new Request(
					'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1',
					{
						headers: {
							'x-forwarded-for': forwardedFor
						}
					}
				),
				url: new URL(
					'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
				),
				fetch,
				getClientAddress: () => '203.0.113.2'
			}) as never;

		expect((await GET(createEvent('198.51.100.10, 203.0.113.1'))).status).toBe(
			200
		);
		now += 1;
		expect((await GET(createEvent('198.51.100.10, 203.0.113.1'))).status).toBe(
			200
		);
		now += 1;

		const limited = await GET(createEvent('198.51.100.10, 203.0.113.1'));

		expect(limited.status).toBe(429);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('keeps using the trusted proxy configuration captured when the handler is created', async () => {
		const GET = _createAvatarGetHandler({
			trustedProxyIps: ['203.0.113.1', '203.0.113.2'],
			rateLimiter: createSlidingWindowRateLimiter({
				limit: 1,
				windowMs: 60_000,
				maxEntries: 128,
				now: () => 1_000
			})
		});
		const fetch = vi.fn(
			async () =>
				new Response('image-bytes', {
					status: 200,
					headers: {
						'cache-control': 'public, max-age=60',
						'content-type': 'image/png',
						'content-length': '11'
					}
				})
		);
		const createEvent = (forwardedFor: string) =>
			({
				request: new Request(
					'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1',
					{
						headers: {
							'x-forwarded-for': forwardedFor
						}
					}
				),
				url: new URL(
					'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
				),
				fetch,
				getClientAddress: () => '203.0.113.2'
			}) as never;

		expect((await GET(createEvent('198.51.100.10, 203.0.113.1'))).status).toBe(
			200
		);

		vi.stubEnv('TRUST_X_FORWARDED_PROTO', 'true');
		vi.stubEnv('TRUSTED_PROXY_IPS', ' ');

		expect((await GET(createEvent('198.51.100.11, 203.0.113.1'))).status).toBe(
			200
		);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('rejects avatar requests when the runtime cannot determine any client address', async () => {
		const GET = _createAvatarGetHandler({
			rateLimiter: createSlidingWindowRateLimiter({
				limit: 1,
				windowMs: 60_000,
				maxEntries: 128,
				now: () => 1_000
			})
		});
		const fetch = vi.fn();
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

		expect(response.status).toBe(503);
		expect(fetch).not.toHaveBeenCalled();
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		await expect(response.text()).resolves.toBe('Service unavailable');
		expect(errorSpy).toHaveBeenCalledWith(
			'Avatar proxy request failed',
			expect.objectContaining({
				incidentId: expect.stringMatching(/^avatar_[0-9a-f-]+$/),
				requestId: 'missing',
				pathname: '/avatar',
				method: 'GET',
				sourceHost: 'avatars.githubusercontent.com',
				failureClass: 'client-address',
				responseStatus: 503,
				errorCode: 'AVATAR_PROXY_FAILURE'
			})
		);
	});

	it('falls back to the direct proxy peer when trusted forwarding headers are malformed', async () => {
		vi.stubEnv('TRUST_X_FORWARDED_PROTO', 'true');
		vi.stubEnv('TRUSTED_PROXY_IPS', '203.0.113.1,203.0.113.2');

		let now = 1_000;
		const GET = _createAvatarGetHandler({
			rateLimiter: createSlidingWindowRateLimiter({
				limit: 1,
				windowMs: 60_000,
				maxEntries: 128,
				now: () => now
			})
		});
		const fetch = vi.fn(
			async () =>
				new Response('image-bytes', {
					status: 200,
					headers: {
						'cache-control': 'public, max-age=60',
						'content-type': 'image/png',
						'content-length': '11'
					}
				})
		);
		const createEvent = (proxyIp: string) =>
			({
				request: new Request(
					'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1',
					{
						headers: {
							'x-forwarded-for': '198.51.100.10, garbage'
						}
					}
				),
				url: new URL(
					'https://kaivalo.test/avatar?source=https://avatars.githubusercontent.com/u/1'
				),
				fetch,
				getClientAddress: () => proxyIp
			}) as never;

		expect((await GET(createEvent('203.0.113.2'))).status).toBe(200);
		now += 1;

		const limited = await GET(createEvent('203.0.113.2'));

		expect(limited.status).toBe(429);
		now += 1;
		expect((await GET(createEvent('203.0.113.1'))).status).toBe(200);
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});
