import { error, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getErrorLogContext } from '../server/error-diagnostics.js';
import { normalizeRequestId } from './log-context.js';
import { buildAuthErrorRedirectQuery } from './auth-error-query.js';
import {
	isRedirectLikeObject,
	normalizeSameOriginRedirectLocation,
	REDIRECT_RESPONSE_STATUSES
} from './safe-redirect.js';

/** @typedef {import('@sveltejs/kit').RequestEvent} RequestEvent */
/**
 * @typedef {object} CallbackLogContext
 * @property {string} requestId
 * @property {string} method
 * @property {string} pathname
 * @property {string} incidentId
 * @property {string} errorName
 * @property {string} errorCode
 * @property {string} [errorUpstreamCode]
 * @property {string} [errorCauseName]
 * @property {string} [errorCauseCode]
 */
/**
 * @typedef {object} CreateAuthCallbackGetHandlerOptions
 * @property {() => (event: RequestEvent) => Promise<Response>} handleCallback
 * @property {(error: unknown) => boolean} isRedirect
 * @property {(error: unknown) => boolean} isHttpError
 * @property {string} cookiePassword
 * @property {boolean} [includeMessageInLogs]
 * @property {(message: string, context: CallbackLogContext) => void} [logError]
 */

/**
 * @param {unknown} value
 * @returns {value is { status: number; location: string }}
 */
function isRedirectLike(value) {
	return isRedirectLikeObject(value);
}

/**
 * @param {Response} response
 * @param {string} location
 * @returns {Response}
 */
function cloneRedirectResponse(response, location) {
	const headers = new Headers(response.headers);
	headers.set('location', location);
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

/**
 * @param {Response} response
 * @param {RequestEvent} event
 * @returns {Response}
 */
function normalizeCallbackResponse(response, event) {
	if (!REDIRECT_RESPONSE_STATUSES.has(response.status)) {
		return response;
	}

	const location = response.headers.get('location');
	if (location === null) {
		return response;
	}

	const safeLocation = normalizeSameOriginRedirectLocation(
		location,
		event.url.origin
	);
	if (!safeLocation) {
		throw new Error('Auth callback produced an invalid redirect location');
	}

	return safeLocation === location
		? response
		: cloneRedirectResponse(response, safeLocation);
}

/**
 * @param {CreateAuthCallbackGetHandlerOptions} options
 * @returns {(event: RequestEvent) => Promise<Response>}
 */
export function createAuthCallbackGetHandler({
	handleCallback,
	isRedirect,
	isHttpError,
	cookiePassword,
	includeMessageInLogs = false,
	logError = console.error
}) {
	/**
	 * @param {RequestEvent} event
	 * @returns {boolean}
	 */
	function shouldUseUserRedirect(event) {
		const mode = event.request.headers.get('sec-fetch-mode');
		const destination = event.request.headers.get('sec-fetch-dest');
		if (mode === 'navigate' || destination === 'document') {
			return true;
		}

		const accept = event.request.headers.get('accept')?.toLowerCase() ?? '';
		return accept.includes('text/html') && !accept.includes('application/json');
	}

	/** @param {RequestEvent} event */
	return async (event) => {
		try {
			const handler = handleCallback();
			return normalizeCallbackResponse(await handler(event), event);
		} catch (err) {
			let normalizedError = err;

			if (isRedirect(err)) {
				if (!isRedirectLike(err)) {
					throw err;
				}

				const safeLocation = normalizeSameOriginRedirectLocation(
					err.location,
					event.url.origin
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
			}

			if (isHttpError(normalizedError)) {
				throw normalizedError;
			}

			const requestId = normalizeRequestId(
				event.request.headers.get('x-request-id')
			);
			const incidentId = `authcb_${randomUUID()}`;
			/** @type {CallbackLogContext} */
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
					secret: cookiePassword
				})}`
			);
		}
	};
}
