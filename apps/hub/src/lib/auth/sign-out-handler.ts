import { error, isHttpError, isRedirect, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getErrorLogContext } from '../server/error-diagnostics.ts';
import { normalizeRequestId } from '../server/request-id.ts';
import { normalizeConfiguredOrigin } from './request-policy.ts';
import {
	isRedirectLikeObject,
	normalizeTrustedRedirectLocation,
	REDIRECT_RESPONSE_STATUSES,
	type RedirectLikeObject
} from './safe-redirect.ts';

type SignOutLogContext = ReturnType<typeof getErrorLogContext> & {
	requestId: string;
	method: string;
	pathname: string;
	incidentId: string;
	errorCode: string;
};

type CreateSignOutPostHandlerOptions = {
	signOut: (event: RequestEvent) => Response | Promise<Response>;
	expectedOrigin: string;
	allowedRedirectOrigins?: Iterable<string>;
	includeMessageInLogs?: boolean;
	logError?: (message: string, context: SignOutLogContext) => void;
};

const SIGN_OUT_MISSING_REDIRECT_LOCATION_ERROR_MESSAGE =
	'Sign-out produced a redirect response without a location header';

function readUrl(value: string): URL | null {
	try {
		return new URL(value);
	} catch {
		return null;
	}
}

function normalizeOriginHeader(value: string): string | null {
	const parsed = readUrl(value);
	if (
		!parsed ||
		parsed.username ||
		parsed.password ||
		parsed.pathname !== '/' ||
		parsed.search ||
		parsed.hash
	) {
		return null;
	}

	return parsed.origin;
}

function normalizeRefererHeader(value: string): string | null {
	const parsed = readUrl(value);
	if (!parsed || parsed.username || parsed.password) {
		return null;
	}

	return parsed.origin;
}

function assertSameOriginRequest(
	event: RequestEvent,
	expectedOrigin: string
): void {
	const origin = event.request.headers.get('origin');
	if (origin !== null && normalizeOriginHeader(origin) !== expectedOrigin) {
		throw error(403, 'Invalid origin');
	}

	const referer = event.request.headers.get('referer');
	if (referer !== null && normalizeRefererHeader(referer) !== expectedOrigin) {
		throw error(403, 'Invalid origin');
	}

	if (origin === null && referer === null) {
		throw error(403, 'Invalid origin');
	}
}

function assertPostMethod(event: RequestEvent): void {
	if (event.request.method !== 'POST') {
		throw error(405, 'Method not allowed');
	}
}

function isRedirectLike(value: unknown): value is RedirectLikeObject {
	if (isRedirect(value)) {
		return true;
	}

	return isRedirectLikeObject(value);
}

function cloneRedirectResponse(response: Response, location: string): Response {
	const headers = new Headers(response.headers);
	headers.set('location', location);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

function normalizeSignOutResponse(
	response: Response,
	requestOrigin: string,
	expectedOrigin: string,
	allowedRedirectOrigins: Iterable<string>
): Response {
	if (!REDIRECT_RESPONSE_STATUSES.has(response.status)) {
		return response;
	}

	const location = response.headers.get('location');
	if (location === null) {
		throw new Error(SIGN_OUT_MISSING_REDIRECT_LOCATION_ERROR_MESSAGE);
	}

	const safeLocation = normalizeTrustedRedirectLocation(location, {
		requestOrigin,
		trustedOrigin: expectedOrigin,
		allowedOrigins: allowedRedirectOrigins
	});
	if (!safeLocation) {
		throw new Error('Sign-out produced an invalid redirect location');
	}

	return safeLocation === location
		? response
		: cloneRedirectResponse(response, safeLocation);
}

export function createSignOutPostHandler({
	signOut,
	expectedOrigin,
	allowedRedirectOrigins = [],
	includeMessageInLogs = false,
	logError = console.error
}: CreateSignOutPostHandlerOptions): (
	event: RequestEvent
) => Promise<Response> {
	const trustedOrigin = normalizeConfiguredOrigin(expectedOrigin);
	const trustedRedirectOrigins = Array.from(allowedRedirectOrigins, (origin) =>
		normalizeConfiguredOrigin(origin)
	);

	return async (event: RequestEvent) => {
		assertPostMethod(event);
		assertSameOriginRequest(event, trustedOrigin);
		try {
			return normalizeSignOutResponse(
				await signOut(event),
				event.url.origin,
				trustedOrigin,
				trustedRedirectOrigins
			);
		} catch (err) {
			let normalizedError = err;
			if (isRedirectLike(err)) {
				const redirectError: RedirectLikeObject = err;
				const safeLocation = normalizeTrustedRedirectLocation(
					redirectError.location,
					{
						requestOrigin: event.url.origin,
						trustedOrigin,
						allowedOrigins: trustedRedirectOrigins
					}
				);
				if (safeLocation) {
					if (
						isRedirect(redirectError) &&
						safeLocation === redirectError.location
					) {
						throw redirectError;
					}
					throw redirect(redirectError.status, safeLocation);
				}
				normalizedError = new Error(
					'Sign-out produced an invalid redirect location'
				);
			}
			if (isHttpError(normalizedError)) {
				throw normalizedError;
			}

			const requestId = normalizeRequestId(
				event.request.headers.get('x-request-id')
			);
			const incidentId = `authso_${randomUUID()}`;
			logError('Sign-out failed', {
				requestId,
				method: event.request.method,
				pathname: event.url.pathname,
				incidentId,
				errorCode: 'AUTH_SIGN_OUT_UNEXPECTED_FAILURE',
				...getErrorLogContext(normalizedError, {
					includeMessage: includeMessageInLogs
				})
			});

			throw error(503, `Sign-out failed. Reference: ${incidentId}`);
		}
	};
}
