import { createHmac, timingSafeEqual } from 'node:crypto';
export {
	AUTH_ERROR_INCIDENT_QUERY_NAME,
	AUTH_ERROR_MESSAGE,
	AUTH_ERROR_QUERY_NAME,
	AUTH_ERROR_QUERY_VALUE,
	AUTH_ERROR_SIGNATURE_QUERY_NAME,
	AUTH_ERROR_TIMESTAMP_QUERY_NAME,
	clearAuthErrorQuery
} from './auth-error-query-shared.ts';
import {
	AUTH_ERROR_INCIDENT_QUERY_NAME,
	AUTH_ERROR_MESSAGE,
	AUTH_ERROR_QUERY_NAME,
	AUTH_ERROR_QUERY_VALUE,
	AUTH_ERROR_SIGNATURE_QUERY_NAME,
	AUTH_ERROR_TIMESTAMP_QUERY_NAME
} from './auth-error-query-shared.ts';
export const AUTH_ERROR_QUERY_TTL_MS = 5 * 60 * 1000;

const AUTH_REDIRECT_INCIDENT_ID_PATTERN =
	/^auth(?:cb|sign)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BuildAuthErrorRedirectQueryOptions = {
	incidentId: string;
	secret: string;
	now?: number;
};

type ReadVerifiedAuthErrorOptions = {
	secret: string;
	now?: number;
};

export type VerifiedAuthError = {
	message: string;
	incidentId: string;
};

function isValidCallbackIncidentId(incidentId: string): boolean {
	return AUTH_REDIRECT_INCIDENT_ID_PATTERN.test(incidentId);
}

function signAuthErrorIncident(
	incidentId: string,
	timestamp: string,
	secret: string
): string {
	return createHmac('sha256', secret)
		.update(`${incidentId}:${timestamp}`)
		.digest('base64url');
}

function normalizeSigningSecret(secret: string): string {
	return secret.trim();
}

function signaturesMatch(
	actualSignature: string,
	expectedSignature: string
): boolean {
	const actualBuffer = Buffer.from(actualSignature);
	const expectedBuffer = Buffer.from(expectedSignature);
	if (actualBuffer.length !== expectedBuffer.length) {
		return false;
	}

	return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function buildAuthErrorRedirectQuery({
	incidentId,
	secret,
	now = Date.now()
}: BuildAuthErrorRedirectQueryOptions): string {
	const normalizedSecret =
		typeof secret === 'string' ? normalizeSigningSecret(secret) : '';
	if (!isValidCallbackIncidentId(incidentId)) {
		throw new Error('incidentId must be a valid auth callback incident id');
	}
	if (normalizedSecret === '') {
		throw new Error('secret must be a non-empty string');
	}

	const timestamp = String(now);
	const params = new URLSearchParams();
	params.set(AUTH_ERROR_QUERY_NAME, AUTH_ERROR_QUERY_VALUE);
	params.set(AUTH_ERROR_INCIDENT_QUERY_NAME, incidentId);
	params.set(AUTH_ERROR_TIMESTAMP_QUERY_NAME, timestamp);
	params.set(
		AUTH_ERROR_SIGNATURE_QUERY_NAME,
		signAuthErrorIncident(incidentId, timestamp, normalizedSecret)
	);
	return params.toString();
}

export function readVerifiedAuthError(
	searchParams: URLSearchParams,
	{ secret, now = Date.now() }: ReadVerifiedAuthErrorOptions
): VerifiedAuthError | null {
	const normalizedSecret =
		typeof secret === 'string' ? normalizeSigningSecret(secret) : '';
	if (
		searchParams.get(AUTH_ERROR_QUERY_NAME) !== AUTH_ERROR_QUERY_VALUE ||
		normalizedSecret === ''
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
		normalizedSecret
	);
	if (!signaturesMatch(signature, expectedSignature)) {
		return null;
	}

	return {
		message: AUTH_ERROR_MESSAGE,
		incidentId
	};
}
