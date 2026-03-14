import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizeConfiguredOrigin } from './request-policy.ts';
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
export const AUTH_ERROR_MAX_FUTURE_SKEW_MS = 30 * 1000;

const AUTH_INCIDENT_ID_PATTERN =
	/^auth(?:cb|sign)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BuildAuthErrorRedirectQueryOptions = {
	incidentId: string;
	secret: string;
	now?: number;
};

type BuildAuthErrorLandingRedirectLocationOptions =
	BuildAuthErrorRedirectQueryOptions & {
		origin: string;
	};

type ReadVerifiedAuthErrorOptions = {
	secret: string;
	now?: number;
};

export type AuthErrorRedirectShape = {
	incidentId: string;
	timestamp: string;
	signature: string;
};

export type VerifiedAuthError = {
	message: string;
	incidentId: string;
};

const AUTH_ERROR_SIGNATURE_PATTERN = /^[A-Za-z0-9_-]+$/;

function isValidAuthIncidentId(incidentId: string): boolean {
	return AUTH_INCIDENT_ID_PATTERN.test(incidentId);
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
	if (!isValidAuthIncidentId(incidentId)) {
		throw new Error('incidentId must be a valid auth incident id');
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

export function buildAuthErrorLandingRedirectLocation({
	incidentId,
	secret,
	origin,
	now
}: BuildAuthErrorLandingRedirectLocationOptions): string {
	const landingUrl = new URL('/', normalizeConfiguredOrigin(origin, 'origin'));
	landingUrl.search = buildAuthErrorRedirectQuery({
		incidentId,
		secret,
		now
	});
	return landingUrl.toString();
}

export function readAuthErrorRedirectShape(
	searchParams: URLSearchParams
): AuthErrorRedirectShape | null {
	if (searchParams.get(AUTH_ERROR_QUERY_NAME) !== AUTH_ERROR_QUERY_VALUE) {
		return null;
	}

	const incidentId = searchParams.get(AUTH_ERROR_INCIDENT_QUERY_NAME);
	const timestamp = searchParams.get(AUTH_ERROR_TIMESTAMP_QUERY_NAME);
	const signature = searchParams.get(AUTH_ERROR_SIGNATURE_QUERY_NAME);
	if (!incidentId || !timestamp || !signature) {
		return null;
	}
	if (
		!isValidAuthIncidentId(incidentId) ||
		!/^\d+$/.test(timestamp) ||
		!AUTH_ERROR_SIGNATURE_PATTERN.test(signature)
	) {
		return null;
	}

	const issuedAt = Number(timestamp);
	if (!Number.isSafeInteger(issuedAt)) {
		return null;
	}

	return {
		incidentId,
		timestamp,
		signature
	};
}

export function readVerifiedAuthError(
	searchParams: URLSearchParams,
	{ secret, now = Date.now() }: ReadVerifiedAuthErrorOptions
): VerifiedAuthError | null {
	const normalizedSecret =
		typeof secret === 'string' ? normalizeSigningSecret(secret) : '';
	if (normalizedSecret === '') {
		return null;
	}

	const shape = readAuthErrorRedirectShape(searchParams);
	if (!shape) {
		return null;
	}

	const issuedAt = Number(shape.timestamp);
	if (
		!Number.isSafeInteger(issuedAt) ||
		issuedAt - now > AUTH_ERROR_MAX_FUTURE_SKEW_MS
	) {
		return null;
	}
	if (now - issuedAt > AUTH_ERROR_QUERY_TTL_MS) {
		return null;
	}

	const expectedSignature = signAuthErrorIncident(
		shape.incidentId,
		shape.timestamp,
		normalizedSecret
	);
	if (!signaturesMatch(shape.signature, expectedSignature)) {
		return null;
	}

	return {
		message: AUTH_ERROR_MESSAGE,
		incidentId: shape.incidentId
	};
}
