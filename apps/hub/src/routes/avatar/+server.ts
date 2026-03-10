import type { RequestHandler } from './$types';
import {
	AVATAR_ALLOWED_CONTENT_TYPES,
	AVATAR_FETCH_TIMEOUT_MS,
	AVATAR_MAX_RESPONSE_BYTES
} from '$lib/server/avatar-proxy.ts';
import { sanitizeAvatarUrl } from '$lib/server/avatar-url.ts';

const AVATAR_CACHE_CONTROL = 'public';
const AVATAR_CACHE_MAX_AGE_SECONDS = 300;
const AVATAR_CACHE_STALE_WHILE_REVALIDATE_SECONDS = 86400;
const PRIVATE_NO_STORE_CACHE_CONTROL = 'private, no-store';

type CacheDirectiveMap = Map<string, string | true>;

function getAvatarContentType(upstream: Response): string | null {
	const contentType = upstream.headers.get('content-type');
	if (!contentType) {
		return null;
	}

	const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
	return AVATAR_ALLOWED_CONTENT_TYPES.has(mediaType) ? mediaType : null;
}

function createGatewayErrorResponse(status: number, message: string): Response {
	return new Response(message, {
		status,
		headers: {
			'cache-control': PRIVATE_NO_STORE_CACHE_CONTROL
		}
	});
}

async function cancelUpstreamBody(
	upstream: Response,
	reason: string
): Promise<void> {
	if (!upstream.body || upstream.body.locked) {
		return;
	}

	try {
		await upstream.body.cancel(reason);
	} catch {
		// Ignore cleanup failures from already-closed or errored streams.
	}
}

function parseCacheControl(headerValue: string | null): CacheDirectiveMap {
	const directives = new Map<string, string | true>();
	if (!headerValue) {
		return directives;
	}

	for (const directive of headerValue.split(',')) {
		const trimmedDirective = directive.trim();
		if (!trimmedDirective) {
			continue;
		}

		const separatorIndex = trimmedDirective.indexOf('=');
		if (separatorIndex === -1) {
			directives.set(trimmedDirective.toLowerCase(), true);
			continue;
		}

		const name = trimmedDirective.slice(0, separatorIndex).trim().toLowerCase();
		const rawValue = trimmedDirective.slice(separatorIndex + 1).trim();
		if (!name || rawValue.length === 0) {
			continue;
		}

		directives.set(name, rawValue.replace(/^"|"$/g, ''));
	}

	return directives;
}

function getIntegerDirective(
	directives: CacheDirectiveMap,
	name: string
): number | null {
	const value = directives.get(name);
	if (typeof value !== 'string' || !/^\d+$/.test(value)) {
		return null;
	}

	const parsed = Number.parseInt(value, 10);
	return Number.isSafeInteger(parsed) ? parsed : null;
}

function buildAvatarCacheControl(upstream: Response): string {
	const directives = parseCacheControl(upstream.headers.get('cache-control'));
	if (directives.has('no-store')) {
		return PRIVATE_NO_STORE_CACHE_CONTROL;
	}

	if (!directives.has('public') || directives.has('private')) {
		return PRIVATE_NO_STORE_CACHE_CONTROL;
	}

	if (directives.has('no-cache')) {
		return 'public, max-age=0, must-revalidate';
	}

	const upstreamMaxAge =
		getIntegerDirective(directives, 's-maxage') ??
		getIntegerDirective(directives, 'max-age');
	if (upstreamMaxAge === null) {
		return PRIVATE_NO_STORE_CACHE_CONTROL;
	}

	const cacheDirectives = [
		AVATAR_CACHE_CONTROL,
		`max-age=${Math.min(upstreamMaxAge, AVATAR_CACHE_MAX_AGE_SECONDS)}`
	];
	const staleWhileRevalidate = getIntegerDirective(
		directives,
		'stale-while-revalidate'
	);
	if (staleWhileRevalidate !== null) {
		cacheDirectives.push(
			`stale-while-revalidate=${Math.min(
				staleWhileRevalidate,
				AVATAR_CACHE_STALE_WHILE_REVALIDATE_SECONDS
			)}`
		);
	}
	if (directives.has('must-revalidate')) {
		cacheDirectives.push('must-revalidate');
	}

	return cacheDirectives.join(', ');
}

function copyCacheValidators(upstream: Response, headers: Headers): void {
	const etag = upstream.headers.get('etag');
	if (etag) {
		headers.set('etag', etag);
	}

	const lastModified = upstream.headers.get('last-modified');
	if (lastModified) {
		headers.set('last-modified', lastModified);
	}
}

function getConditionalHeaders(request: Request): Record<string, string> {
	const headers: Record<string, string> = {
		accept: 'image/*'
	};

	const ifNoneMatch = request.headers.get('if-none-match');
	if (ifNoneMatch) {
		headers['if-none-match'] = ifNoneMatch;
	}

	const ifModifiedSince = request.headers.get('if-modified-since');
	if (ifModifiedSince) {
		headers['if-modified-since'] = ifModifiedSince;
	}

	return headers;
}

function isTimeoutError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'TimeoutError';
}

async function readAvatarBody(upstream: Response): Promise<Uint8Array> {
	const advertisedLength = upstream.headers.get('content-length');
	if (advertisedLength) {
		const parsedLength = Number.parseInt(advertisedLength, 10);
		if (
			Number.isFinite(parsedLength) &&
			parsedLength > AVATAR_MAX_RESPONSE_BYTES
		) {
			await cancelUpstreamBody(
				upstream,
				'Avatar response exceeds maximum allowed size'
			);
			throw new Error('Avatar response exceeds maximum allowed size');
		}
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
				await reader.cancel('Avatar response exceeds maximum allowed size');
				throw new Error('Avatar response exceeds maximum allowed size');
			}

			body.set(value, totalBytes - value.byteLength);
		}
	} finally {
		reader.releaseLock();
	}

	return body.subarray(0, totalBytes);
}

export const GET: RequestHandler = async ({ request, url, fetch }) => {
	const source = sanitizeAvatarUrl(url.searchParams.get('source'));
	if (!source) {
		return createGatewayErrorResponse(404, 'Not found');
	}

	let upstream: Response;
	try {
		const timeoutSignal = AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS);
		upstream = await fetch(source, {
			headers: getConditionalHeaders(request),
			redirect: 'error',
			signal: timeoutSignal
		});
	} catch (error) {
		if (isTimeoutError(error)) {
			return createGatewayErrorResponse(504, 'Gateway timeout');
		}

		return createGatewayErrorResponse(502, 'Bad gateway');
	}

	const headers = new Headers({
		'cache-control': buildAvatarCacheControl(upstream),
		'x-content-type-options': 'nosniff'
	});
	copyCacheValidators(upstream, headers);

	if (upstream.status === 304) {
		return new Response(null, {
			status: 304,
			headers
		});
	}

	if (!upstream.ok) {
		await cancelUpstreamBody(upstream, 'Rejected upstream avatar status');
		return createGatewayErrorResponse(502, 'Bad gateway');
	}

	const contentType = getAvatarContentType(upstream);
	if (!contentType) {
		await cancelUpstreamBody(upstream, 'Rejected upstream avatar content type');
		return createGatewayErrorResponse(502, 'Bad gateway');
	}

	let body: Uint8Array;
	try {
		body = await readAvatarBody(upstream);
	} catch (error) {
		if (isTimeoutError(error)) {
			await cancelUpstreamBody(upstream, 'Avatar response timed out');
			return createGatewayErrorResponse(504, 'Gateway timeout');
		}

		await cancelUpstreamBody(upstream, 'Rejected upstream avatar body');
		return createGatewayErrorResponse(502, 'Bad gateway');
	}

	headers.set('content-type', contentType);
	headers.set('content-length', String(body.byteLength));
	const responseBody = body as unknown as BodyInit;

	return new Response(responseBody, {
		status: 200,
		headers
	});
};
