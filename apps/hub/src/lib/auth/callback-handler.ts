import { error, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getErrorLogContext } from '../server/error-diagnostics.ts';
import { normalizeRequestId } from '../server/request-id.ts';
import { buildAuthErrorRedirectQuery } from './auth-error-query.ts';
import {
	isRedirectLikeObject,
	normalizeSameOriginRedirectLocation,
	REDIRECT_RESPONSE_STATUSES,
	type RedirectLikeObject
} from './safe-redirect.ts';

type CallbackLogContext = ReturnType<typeof getErrorLogContext> & {
	requestId: string;
	method: string;
	pathname: string;
	incidentId: string;
	errorCode: string;
};

type CreateAuthCallbackGetHandlerOptions = {
	handleCallback: () => (event: RequestEvent) => Promise<Response>;
	isRedirect: (error: unknown) => boolean;
	isHttpError: (error: unknown) => boolean;
	authErrorSigningSecret: string;
	expectedOrigin: string;
	includeMessageInLogs?: boolean;
	logError?: (message: string, context: CallbackLogContext) => void;
};

type CallbackRedirectResolution =
	| {
			kind: 'redirect';
			location: string;
	  }
	| {
			kind: 'auth-error';
			error: Error;
	  };

const CALLBACK_AUTH_ERROR_PATHNAME = '/auth/error';
const CALLBACK_AUTH_ERROR_REDIRECT_CODE = 'WORKOS_CALLBACK_AUTH_ERROR_REDIRECT';

function isRedirectLike(value: unknown): value is RedirectLikeObject {
	if (isRedirectLikeObject(value)) {
		return true;
	}

	return false;
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

function createAuthErrorRedirectFailure(
	location: string,
	origin: string
): Error {
	const parsedLocation = new URL(location, origin);
	const upstreamErrorCode =
		parsedLocation.searchParams.get('code') ?? undefined;

	return Object.assign(
		new Error('Auth callback redirected to an unsupported auth error route'),
		{
			code: CALLBACK_AUTH_ERROR_REDIRECT_CODE,
			cause: upstreamErrorCode
				? Object.assign(
						new Error(`Upstream auth callback error: ${upstreamErrorCode}`),
						{
							code: upstreamErrorCode
						}
					)
				: undefined
		}
	);
}

function normalizeCallbackRedirectLocation(
	location: string,
	requestOrigin: string,
	expectedOrigin: string
): CallbackRedirectResolution | null {
	const safeLocation = normalizeSameOriginRedirectLocation(location, {
		requestOrigin,
		trustedOrigin: expectedOrigin
	});
	if (!safeLocation) {
		return null;
	}

	const parsedLocation = new URL(safeLocation, expectedOrigin);
	if (parsedLocation.pathname === CALLBACK_AUTH_ERROR_PATHNAME) {
		return {
			kind: 'auth-error',
			error: createAuthErrorRedirectFailure(safeLocation, expectedOrigin)
		};
	}

	return {
		kind: 'redirect',
		location: safeLocation
	};
}

function normalizeCallbackResponse(
	response: Response,
	requestOrigin: string,
	expectedOrigin: string
): Response {
	if (!REDIRECT_RESPONSE_STATUSES.has(response.status)) {
		return response;
	}

	const location = response.headers.get('location');
	if (location === null) {
		return response;
	}

	const redirectResolution = normalizeCallbackRedirectLocation(
		location,
		requestOrigin,
		expectedOrigin
	);
	if (!redirectResolution) {
		throw new Error('Auth callback produced an invalid redirect location');
	}
	if (redirectResolution.kind === 'auth-error') {
		throw redirectResolution.error;
	}

	const safeLocation = redirectResolution.location;

	return safeLocation === location
		? response
		: cloneRedirectResponse(response, safeLocation);
}

export function createAuthCallbackGetHandler({
	handleCallback,
	isRedirect,
	isHttpError,
	authErrorSigningSecret,
	expectedOrigin,
	includeMessageInLogs = false,
	logError = console.error
}: CreateAuthCallbackGetHandlerOptions): (
	event: RequestEvent
) => Promise<Response> {
	let trustedOrigin: string;
	try {
		const parsed = new URL(expectedOrigin);
		if (
			parsed.username ||
			parsed.password ||
			parsed.pathname !== '/' ||
			parsed.search ||
			parsed.hash
		) {
			throw new Error();
		}
		trustedOrigin = parsed.origin;
	} catch {
		throw new Error('expectedOrigin must be a valid URL origin');
	}

	function shouldUseUserRedirect(event: RequestEvent): boolean {
		const mode = event.request.headers.get('sec-fetch-mode');
		const destination = event.request.headers.get('sec-fetch-dest');
		if (mode === 'navigate' || destination === 'document') {
			return true;
		}

		const accept = event.request.headers.get('accept')?.toLowerCase() ?? '';
		return accept.includes('text/html') && !accept.includes('application/json');
	}

	return async (event: RequestEvent) => {
		const requestOrigin = event.url.origin;
		try {
			const handler = handleCallback();
			return normalizeCallbackResponse(
				await handler(event),
				requestOrigin,
				trustedOrigin
			);
		} catch (err) {
			let normalizedError = err;

			if (isRedirect(err)) {
				if (!isRedirectLike(err)) {
					throw err;
				}

				const redirectResolution = normalizeCallbackRedirectLocation(
					err.location,
					requestOrigin,
					trustedOrigin
				);
				if (redirectResolution?.kind === 'redirect') {
					const safeLocation = redirectResolution.location;
					if (safeLocation === err.location) {
						throw err;
					}
					throw redirect(err.status, safeLocation);
				}
				normalizedError =
					redirectResolution?.kind === 'auth-error'
						? redirectResolution.error
						: new Error('Auth callback produced an invalid redirect location');
			} else if (isRedirectLike(err)) {
				const redirectResolution = normalizeCallbackRedirectLocation(
					err.location,
					requestOrigin,
					trustedOrigin
				);
				if (redirectResolution?.kind === 'redirect') {
					throw redirect(err.status, redirectResolution.location);
				}
				normalizedError =
					redirectResolution?.kind === 'auth-error'
						? redirectResolution.error
						: new Error('Auth callback produced an invalid redirect location');
			}

			if (isHttpError(normalizedError)) {
				throw normalizedError;
			}

			const requestId = normalizeRequestId(
				event.request.headers.get('x-request-id')
			);
			const incidentId = `authcb_${randomUUID()}`;
			const callbackLogContext = {
				requestId,
				method: event.request.method,
				pathname: event.url.pathname,
				incidentId,
				errorCode: 'AUTH_CALLBACK_UNEXPECTED_FAILURE',
				...getErrorLogContext(normalizedError, {
					includeMessage: includeMessageInLogs
				})
			};

			logError('Auth callback failed', callbackLogContext);

			if (!shouldUseUserRedirect(event)) {
				throw error(503, `Auth callback failed. Reference: ${incidentId}`);
			}

			throw redirect(
				303,
				`/?${buildAuthErrorRedirectQuery({
					incidentId,
					secret: authErrorSigningSecret
				})}`
			);
		}
	};
}
