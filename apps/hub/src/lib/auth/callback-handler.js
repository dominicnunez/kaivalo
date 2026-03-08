import { error, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getErrorLogContext } from '$lib/server/error-diagnostics.js';
import { normalizeRequestId } from './log-context.js';
import { buildAuthErrorRedirectQuery } from './auth-error-query.js';

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
 * @property {(message: string, context: CallbackLogContext) => void} [logError]
 */

/**
 * @param {CreateAuthCallbackGetHandlerOptions} options
 * @returns {(event: RequestEvent) => Promise<Response>}
 */
export function createAuthCallbackGetHandler({
	handleCallback,
	isRedirect,
	isHttpError,
	cookiePassword,
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
			return await handler(event);
		} catch (err) {
			if (isRedirect(err) || isHttpError(err)) {
				throw err;
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
				...getErrorLogContext(err)
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
