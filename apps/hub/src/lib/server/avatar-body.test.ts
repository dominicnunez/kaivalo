import { describe, expect, it } from 'vitest';
import { AvatarResponseSizeError, readAvatarBody } from './avatar-body.ts';
import { AVATAR_MAX_RESPONSE_BYTES } from './avatar-proxy.ts';

describe('readAvatarBody', () => {
	it('reassembles chunked avatar responses with the exact payload bytes', async () => {
		const chunks = [
			new TextEncoder().encode('image-'),
			new TextEncoder().encode('bytes'),
			new Uint8Array([33])
		];
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(chunk);
				}
				controller.close();
			}
		});

		const body = await readAvatarBody(
			new Response(stream, {
				headers: {
					'content-type': 'image/png'
				}
			})
		);

		expect(new TextDecoder().decode(body)).toBe('image-bytes!');
		expect(body.byteLength).toBe(12);
	});

	it('rejects advertised avatar bodies that exceed the byte limit', async () => {
		const upstream = new Response(new Uint8Array([1]), {
			headers: {
				'content-type': 'image/png',
				'content-length': String(AVATAR_MAX_RESPONSE_BYTES + 1)
			}
		});

		await expect(readAvatarBody(upstream)).rejects.toThrow(
			'Avatar response exceeds maximum allowed size'
		);
	});

	it('rejects streamed avatar bodies that exceed the byte limit', async () => {
		const chunk = new Uint8Array(AVATAR_MAX_RESPONSE_BYTES / 2 + 1);
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(chunk);
				controller.enqueue(chunk);
				controller.close();
			}
		});

		await expect(
			readAvatarBody(
				new Response(stream, {
					headers: {
						'content-type': 'image/png'
					}
				})
			)
		).rejects.toThrow('Avatar response exceeds maximum allowed size');
	});

	it('keeps oversize streamed bodies classified as size-limit failures when cancel rejects', async () => {
		const chunk = new Uint8Array(AVATAR_MAX_RESPONSE_BYTES / 2 + 1);
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(chunk);
				controller.enqueue(chunk);
				controller.close();
			},
			cancel() {
				return Promise.reject(new Error('cancel failed'));
			}
		});

		await expect(
			readAvatarBody(
				new Response(stream, {
					headers: {
						'content-type': 'image/png'
					}
				})
			)
		).rejects.toBeInstanceOf(AvatarResponseSizeError);
	});
});
