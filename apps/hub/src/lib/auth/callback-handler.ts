import { error, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getErrorLogContext } from '../server/error-diagnostics.ts';
import { normalizeRequestId } from '../server/request-id.ts';
import { buildAuthErrorLandingRedirectLocation } from './auth-error-query.ts';
import {
	isRedirectLikeObject,
	normalizeSameOriginRedirectLocation,
	REDIRECT_RESPONSE_STATUSES,
	type RedirectLikeObject
} from './safe-redirect.ts';
import {
	isBrowserNavigationRequest,
	normalizeConfiguredOrigin
} from './request-policy.ts';

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
const CALLBACK_AUTH_ERROR_QUERY_NAME = 'code';
const CALLBACK_PROVIDER_ERROR_CODE_QUERY_NAME = 'provider_code';
const CALLBACK_MISSING_REDIRECT_LOCATION_ERROR_MESSAGE =
	'Auth callback produced a redirect response without a location header';

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
	const errorCode =
		parsedLocation.searchParams.get(CALLBACK_AUTH_ERROR_QUERY_NAME) ??
		CALLBACK_AUTH_ERROR_REDIRECT_CODE;
	const providerErrorCode =
		parsedLocation.searchParams.get(CALLBACK_PROVIDER_ERROR_CODE_QUERY_NAME) ??
		undefined;

	const error = Object.assign(
		new Error('Auth callback redirected to an unsupported auth error route'),
		{
			code: errorCode
		}
	);
	if (providerErrorCode) {
		error.cause = Object.assign(
			new Error(`Upstream auth callback error: ${providerErrorCode}`),
			{
				code: providerErrorCode
			}
		);
	}

	return error;
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
		throw new Error(CALLBACK_MISSING_REDIRECT_LOCATION_ERROR_MESSAGE);
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
	const trustedOrigin = normalizeConfiguredOrigin(expectedOrigin);

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

			if (!isBrowserNavigationRequest(event.request)) {
				throw error(503, `Auth callback failed. Reference: ${incidentId}`);
			}

			throw redirect(
				303,
				buildAuthErrorLandingRedirectLocation({
					incidentId,
					secret: authErrorSigningSecret,
					origin: trustedOrigin
				})
			);
		}
	};
}
