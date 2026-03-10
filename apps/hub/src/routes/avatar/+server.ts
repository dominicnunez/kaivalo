import type { RequestHandler } from './$types';
import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import {
	AVATAR_ALLOWED_CONTENT_TYPES,
	AVATAR_FETCH_TIMEOUT_MS,
	AVATAR_MAX_RESPONSE_BYTES
} from '$lib/server/avatar-proxy.ts';
import { sanitizeAvatarUrl } from '$lib/server/avatar-url.ts';
import {
	getErrorLogContext,
	shouldIncludeErrorMessage
} from '$lib/server/error-diagnostics.ts';
import {
	createSlidingWindowRateLimiter,
	type SlidingWindowRateLimiter
} from '$lib/server/request-rate-limit.ts';
import { normalizeRequestId } from '$lib/server/request-id.ts';
import { getTrustedClientAddress } from '$lib/server/trusted-client-address.ts';
import { getProxyTrustConfiguration } from '$lib/server/workos-security.ts';

const AVATAR_CACHE_CONTROL = 'public';
const AVATAR_CACHE_MAX_AGE_SECONDS = 300;
const AVATAR_CACHE_STALE_WHILE_REVALIDATE_SECONDS = 86400;
const AVATAR_RATE_LIMIT_MAX_REQUESTS = 30;
const AVATAR_RATE_LIMIT_WINDOW_MS = 60_000;
const AVATAR_RATE_LIMIT_MAX_ENTRIES = 10_000;
const AVATAR_PROXY_ERROR_CODE = 'AVATAR_PROXY_FAILURE';
const TOO_MANY_REQUESTS_MESSAGE = 'Too many requests';
const TOO_MANY_REQUESTS_STATUS = 429;
const PRIVATE_NO_STORE_CACHE_CONTROL = 'private, no-store';

type CacheDirectiveMap = Map<string, string | true>;
type AvatarFailureClass =
	| 'fetch'
	| 'status'
	| 'content-type'
	| 'size'
	| 'stream';
type AvatarFailureLogOptions = {
	request: Request;
	pathname: string;
	source: string;
	failureClass: AvatarFailureClass;
	responseStatus: number;
	error?: unknown;
	upstreamStatus?: number;
	upstreamContentType?: string | null;
};

class AvatarResponseSizeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AvatarResponseSizeError';
	}
}

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

function createTooManyRequestsResponse(retryAfterSeconds: number): Response {
	return new Response(TOO_MANY_REQUESTS_MESSAGE, {
		status: TOO_MANY_REQUESTS_STATUS,
		headers: {
			'cache-control': PRIVATE_NO_STORE_CACHE_CONTROL,
			'retry-after': String(retryAfterSeconds)
		}
	});
}

function getLoggedContentType(headerValue: string | null): string | null {
	if (!headerValue) {
		return null;
	}

	const mediaType = headerValue.split(';', 1)[0]?.trim().toLowerCase() ?? '';
	return mediaType || null;
}

function getAvatarLoggableError(error: unknown): unknown {
	if (error instanceof DOMException) {
		const normalizedError = new Error(error.message);
		normalizedError.name = error.name;
		return normalizedError;
	}

	return error;
}

function logAvatarFailure({
	request,
	pathname,
	source,
	failureClass,
	responseStatus,
	error,
	upstreamStatus,
	upstreamContentType
}: AvatarFailureLogOptions): void {
	const incidentId = `avatar_${randomUUID()}`;
	const logRecord: Record<string, string | number> = {
		incidentId,
		requestId: normalizeRequestId(request.headers.get('x-request-id')),
		pathname,
		method: request.method,
		sourceHost: new URL(source).hostname,
		failureClass,
		responseStatus,
		errorCode: AVATAR_PROXY_ERROR_CODE
	};

	if (typeof upstreamStatus === 'number') {
		logRecord.upstreamStatus = upstreamStatus;
	}

	if (upstreamContentType) {
		logRecord.upstreamContentType = upstreamContentType;
	}

	console.error('Avatar proxy request failed', {
		...logRecord,
		...(error === undefined
			? {}
			: getErrorLogContext(getAvatarLoggableError(error), {
					includeMessage: shouldIncludeErrorMessage(env)
				}))
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

	const browserMaxAge = getIntegerDirective(directives, 'max-age');
	if (browserMaxAge === null) {
		return PRIVATE_NO_STORE_CACHE_CONTROL;
	}

	const cacheDirectives = [
		AVATAR_CACHE_CONTROL,
		`max-age=${Math.min(browserMaxAge, AVATAR_CACHE_MAX_AGE_SECONDS)}`
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
			throw new AvatarResponseSizeError(
				'Avatar response exceeds maximum allowed size'
			);
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
				throw new AvatarResponseSizeError(
					'Avatar response exceeds maximum allowed size'
				);
			}

			body.set(value, totalBytes - value.byteLength);
		}
	} finally {
		reader.releaseLock();
	}

	return body.subarray(0, totalBytes);
}

function getAvatarRateLimitKey(
	event: Parameters<RequestHandler>[0],
	trustedProxyIps: readonly string[]
): string {
	if (typeof event.getClientAddress !== 'function') {
		return '';
	}

	try {
		return getTrustedClientAddress({
			directClientAddress: event.getClientAddress(),
			forwardedForHeader: event.request.headers.get('x-forwarded-for'),
			trustedProxyIps
		});
	} catch {
		return '';
	}
}

type CreateAvatarGetHandlerOptions = {
	rateLimiter?: SlidingWindowRateLimiter;
	trustedProxyIps?: readonly string[];
};

export function _createAvatarGetHandler({
	trustedProxyIps,
	rateLimiter = createSlidingWindowRateLimiter({
		limit: AVATAR_RATE_LIMIT_MAX_REQUESTS,
		windowMs: AVATAR_RATE_LIMIT_WINDOW_MS,
		maxEntries: AVATAR_RATE_LIMIT_MAX_ENTRIES
	})
}: CreateAvatarGetHandlerOptions = {}): RequestHandler {
	const configuredTrustedProxyIps =
		trustedProxyIps ??
		(() => {
			try {
				return getProxyTrustConfiguration(
					env,
					env.ORIGIN?.trim() || 'http://localhost'
				).trustedProxyIps;
			} catch {
				return [];
			}
		})();

	return async (event) => {
		const { request, url, fetch } = event;
		const source = sanitizeAvatarUrl(url.searchParams.get('source'));
		if (!source) {
			return createGatewayErrorResponse(404, 'Not found');
		}

		const rateLimitKey = getAvatarRateLimitKey(
			event,
			configuredTrustedProxyIps
		);
		const rateLimitResult = rateLimiter.check(rateLimitKey);
		if (!rateLimitResult.allowed) {
			return createTooManyRequestsResponse(rateLimitResult.retryAfterSeconds);
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
				logAvatarFailure({
					request,
					pathname: url.pathname,
					source,
					failureClass: 'fetch',
					responseStatus: 504,
					error
				});
				return createGatewayErrorResponse(504, 'Gateway timeout');
			}

			logAvatarFailure({
				request,
				pathname: url.pathname,
				source,
				failureClass: 'fetch',
				responseStatus: 502,
				error
			});
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
			logAvatarFailure({
				request,
				pathname: url.pathname,
				source,
				failureClass: 'status',
				responseStatus: 502,
				upstreamStatus: upstream.status
			});
			return createGatewayErrorResponse(502, 'Bad gateway');
		}

		const contentType = getAvatarContentType(upstream);
		if (!contentType) {
			await cancelUpstreamBody(
				upstream,
				'Rejected upstream avatar content type'
			);
			logAvatarFailure({
				request,
				pathname: url.pathname,
				source,
				failureClass: 'content-type',
				responseStatus: 502,
				upstreamContentType: getLoggedContentType(
					upstream.headers.get('content-type')
				)
			});
			return createGatewayErrorResponse(502, 'Bad gateway');
		}

		let body: Uint8Array;
		try {
			body = await readAvatarBody(upstream);
		} catch (error) {
			if (isTimeoutError(error)) {
				await cancelUpstreamBody(upstream, 'Avatar response timed out');
				logAvatarFailure({
					request,
					pathname: url.pathname,
					source,
					failureClass: 'stream',
					responseStatus: 504,
					error
				});
				return createGatewayErrorResponse(504, 'Gateway timeout');
			}

			await cancelUpstreamBody(upstream, 'Rejected upstream avatar body');
			logAvatarFailure({
				request,
				pathname: url.pathname,
				source,
				failureClass:
					error instanceof AvatarResponseSizeError ? 'size' : 'stream',
				responseStatus: 502,
				error
			});
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
}

export const GET: RequestHandler = _createAvatarGetHandler();
