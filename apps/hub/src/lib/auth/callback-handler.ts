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

function normalizeCallbackResponse(
	response: Response,
	expectedOrigin: string
): Response {
	if (!REDIRECT_RESPONSE_STATUSES.has(response.status)) {
		return response;
	}

	const location = response.headers.get('location');
	if (location === null) {
		return response;
	}

	const safeLocation = normalizeSameOriginRedirectLocation(
		location,
		expectedOrigin
	);
	if (!safeLocation) {
		throw new Error('Auth callback produced an invalid redirect location');
	}

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
		try {
			const handler = handleCallback();
			return normalizeCallbackResponse(await handler(event), trustedOrigin);
		} catch (err) {
			let normalizedError = err;

			if (isRedirect(err)) {
				if (!isRedirectLike(err)) {
					throw err;
				}

				const safeLocation = normalizeSameOriginRedirectLocation(
					err.location,
					trustedOrigin
				);
				if (safeLocation) {
					if (safeLocation === err.location) {
						throw err;
					}
					throw redirect(err.status, safeLocation);
				}
				normalizedError = new Error(
					'Auth callback produced an invalid redirect location'
				);
			} else if (isRedirectLike(err)) {
				const safeLocation = normalizeSameOriginRedirectLocation(
					err.location,
					trustedOrigin
				);
				if (safeLocation) {
					throw redirect(err.status, safeLocation);
				}
				normalizedError = new Error(
					'Auth callback produced an invalid redirect location'
				);
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
