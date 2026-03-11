import { AVATAR_MAX_RESPONSE_BYTES } from './avatar-proxy.ts';

export const AVATAR_RESPONSE_TOO_LARGE_MESSAGE =
	'Avatar response exceeds maximum allowed size';

export class AvatarResponseSizeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AvatarResponseSizeError';
	}
}

export async function cancelResponseBody(
	response: Response,
	reason: string
): Promise<void> {
	if (!response.body || response.body.locked) {
		return;
	}

	try {
		await response.body.cancel(reason);
	} catch {
		// Ignore cleanup failures from already-closed or errored streams.
	}
}

function getAdvertisedAvatarLength(upstream: Response): number | null {
	const advertisedLength = upstream.headers.get('content-length');
	if (!advertisedLength || !/^\d+$/.test(advertisedLength)) {
		return null;
	}

	const parsedLength = Number.parseInt(advertisedLength, 10);
	if (!Number.isSafeInteger(parsedLength)) {
		return null;
	}

	return parsedLength;
}

export async function readAvatarBody(upstream: Response): Promise<Uint8Array> {
	const advertisedLength = getAdvertisedAvatarLength(upstream);
	if (
		advertisedLength !== null &&
		advertisedLength > AVATAR_MAX_RESPONSE_BYTES
	) {
		await cancelResponseBody(upstream, AVATAR_RESPONSE_TOO_LARGE_MESSAGE);
		throw new AvatarResponseSizeError(AVATAR_RESPONSE_TOO_LARGE_MESSAGE);
	}

	const reader = upstream.body?.getReader();
	if (!reader) {
		return new Uint8Array();
	}

	const body = new Uint8Array(AVATAR_MAX_RESPONSE_BYTES);
	let totalBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			totalBytes += value.byteLength;
			if (totalBytes > AVATAR_MAX_RESPONSE_BYTES) {
				await reader.cancel(AVATAR_RESPONSE_TOO_LARGE_MESSAGE);
				throw new AvatarResponseSizeError(AVATAR_RESPONSE_TOO_LARGE_MESSAGE);
			}

			body.set(value, totalBytes - value.byteLength);
		}
	} finally {
		reader.releaseLock();
	}

	return body.subarray(0, totalBytes);
}
