import { error, isHttpError, isRedirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getErrorLogContext } from '$lib/server/error-diagnostics.js';
import { normalizeRequestId } from './log-context.js';

/** @typedef {import('@sveltejs/kit').RequestEvent} RequestEvent */
/**
 * @typedef {object} CreateSignOutPostHandlerOptions
 * @property {(event: RequestEvent) => Response | Promise<Response>} signOut
 * @property {string} expectedOrigin
 * @property {(message: string, context: {
 * requestId: string
 * method: string
 * pathname: string
 * incidentId: string
 * errorName: string
 * errorCauseName?: string
 * errorCode: string
 * errorUpstreamCode?: string
 * errorCauseCode?: string
 * }) => void} [logError]
 */

/**
 * @param {string} value
 * @returns {string | null}
 */
function readOrigin(value) {
	try {
		return new URL(value).origin;
	} catch {
		return null;
	}
}

/**
 * @param {RequestEvent} event
 * @param {string} expectedOrigin
 * @returns {void}
 */
function assertSameOriginRequest(event, expectedOrigin) {
	const origin = event.request.headers.get('origin');
	if (origin !== null) {
		const normalizedOrigin = readOrigin(origin);
		if (normalizedOrigin !== expectedOrigin) {
			throw error(403, 'Invalid origin');
		}
		return;
	}

	const referer = event.request.headers.get('referer');
	const refererOrigin = referer ? readOrigin(referer) : null;
	if (!refererOrigin || refererOrigin !== expectedOrigin) {
		throw error(403, 'Invalid origin');
	}
}

/**
 * @param {RequestEvent} event
 * @returns {void}
 */
function assertPostMethod(event) {
	if (event.request.method !== 'POST') {
		throw error(405, 'Method not allowed');
	}
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeExpectedOrigin(value) {
	let parsed;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error('expectedOrigin must be a valid URL origin');
	}

	if (
		parsed.username ||
		parsed.password ||
		parsed.pathname !== '/' ||
		parsed.search ||
		parsed.hash
	) {
		throw new Error('expectedOrigin must be a valid URL origin');
	}

	return parsed.origin;
}

/**
 * @param {CreateSignOutPostHandlerOptions} options
 * @returns {(event: RequestEvent) => Promise<Response>}
 */
export function createSignOutPostHandler({
	signOut,
	expectedOrigin,
	logError = console.error
}) {
	const trustedOrigin = normalizeExpectedOrigin(expectedOrigin);

	/** @param {RequestEvent} event */
	return async (event) => {
		assertPostMethod(event);
		assertSameOriginRequest(event, trustedOrigin);
		try {
			return await signOut(event);
		} catch (err) {
			if (isRedirect(err) || isHttpError(err)) {
				throw err;
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
				...getErrorLogContext(err)
			});

			throw error(503, `Sign-out failed. Reference: ${incidentId}`);
		}
	};
}
