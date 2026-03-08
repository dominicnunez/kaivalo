import { createHmac, timingSafeEqual } from 'node:crypto';
export {
	AUTH_ERROR_INCIDENT_QUERY_NAME,
	AUTH_ERROR_MESSAGE,
	AUTH_ERROR_QUERY_NAME,
	AUTH_ERROR_QUERY_VALUE,
	AUTH_ERROR_SIGNATURE_QUERY_NAME,
	AUTH_ERROR_TIMESTAMP_QUERY_NAME,
	clearAuthErrorQuery
} from './auth-error-query-shared.js';
import {
	AUTH_ERROR_INCIDENT_QUERY_NAME,
	AUTH_ERROR_MESSAGE,
	AUTH_ERROR_QUERY_NAME,
	AUTH_ERROR_QUERY_VALUE,
	AUTH_ERROR_SIGNATURE_QUERY_NAME,
	AUTH_ERROR_TIMESTAMP_QUERY_NAME
} from './auth-error-query-shared.js';
export const AUTH_ERROR_QUERY_TTL_MS = 5 * 60 * 1000;

const CALLBACK_INCIDENT_ID_PATTERN =
	/^authcb_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {string} incidentId
 * @returns {boolean}
 */
function isValidCallbackIncidentId(incidentId) {
	return CALLBACK_INCIDENT_ID_PATTERN.test(incidentId);
}

/**
 * @param {string} incidentId
 * @param {string} timestamp
 * @param {string} secret
 * @returns {string}
 */
function signAuthErrorIncident(incidentId, timestamp, secret) {
	return createHmac('sha256', secret)
		.update(`${incidentId}:${timestamp}`)
		.digest('base64url');
}

/**
 * @param {string} actualSignature
 * @param {string} expectedSignature
 * @returns {boolean}
 */
function signaturesMatch(actualSignature, expectedSignature) {
	const actualBuffer = Buffer.from(actualSignature);
	const expectedBuffer = Buffer.from(expectedSignature);
	if (actualBuffer.length !== expectedBuffer.length) {
		return false;
	}

	return timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * @param {{ incidentId: string; secret: string; now?: number }} options
 * @returns {string}
 */
export function buildAuthErrorRedirectQuery({
	incidentId,
	secret,
	now = Date.now()
}) {
	if (!isValidCallbackIncidentId(incidentId)) {
		throw new Error('incidentId must be a valid auth callback incident id');
	}
	if (typeof secret !== 'string' || secret.trim() === '') {
		throw new Error('secret must be a non-empty string');
	}

	const timestamp = String(now);
	const params = new URLSearchParams();
	params.set(AUTH_ERROR_QUERY_NAME, AUTH_ERROR_QUERY_VALUE);
	params.set(AUTH_ERROR_INCIDENT_QUERY_NAME, incidentId);
	params.set(AUTH_ERROR_TIMESTAMP_QUERY_NAME, timestamp);
	params.set(
		AUTH_ERROR_SIGNATURE_QUERY_NAME,
		signAuthErrorIncident(incidentId, timestamp, secret)
	);
	return params.toString();
}

/**
 * @param {URLSearchParams} searchParams
 * @param {{ secret: string; now?: number }} options
 * @returns {{ message: string; incidentId: string } | null}
 */
export function readVerifiedAuthError(
	searchParams,
	{ secret, now = Date.now() }
) {
	if (
		searchParams.get(AUTH_ERROR_QUERY_NAME) !== AUTH_ERROR_QUERY_VALUE ||
		typeof secret !== 'string' ||
		secret.trim() === ''
	) {
		return null;
	}

	const incidentId = searchParams.get(AUTH_ERROR_INCIDENT_QUERY_NAME);
	const timestamp = searchParams.get(AUTH_ERROR_TIMESTAMP_QUERY_NAME);
	const signature = searchParams.get(AUTH_ERROR_SIGNATURE_QUERY_NAME);
	if (!incidentId || !timestamp || !signature) {
		return null;
	}
	if (!isValidCallbackIncidentId(incidentId) || !/^\d+$/.test(timestamp)) {
		return null;
	}

	const issuedAt = Number(timestamp);
	if (!Number.isSafeInteger(issuedAt) || issuedAt > now) {
		return null;
	}
	if (now - issuedAt > AUTH_ERROR_QUERY_TTL_MS) {
		return null;
	}

	const expectedSignature = signAuthErrorIncident(
		incidentId,
		timestamp,
		secret
	);
	if (!signaturesMatch(signature, expectedSignature)) {
		return null;
	}

	return {
		message: AUTH_ERROR_MESSAGE,
		incidentId
	};
}
