import { createHmac, timingSafeEqual } from 'node:crypto';
import { isTrustedAvatarHost } from './trusted-hosts.ts';

export const AVATAR_PROXY_PATH = '/avatar';
export const AVATAR_PROXY_TOKEN_QUERY_NAME = 'token';
export const AVATAR_PROXY_TOKEN_TTL_MS = 5 * 60 * 1000;
export const AVATAR_PROXY_TOKEN_MAX_FUTURE_SKEW_MS = 30 * 1000;

type AvatarProxySigningOptions = {
	secret: string;
	now?: number;
};

type AvatarProxyTokenPayload = {
	source: string;
	timestamp: string;
	signature: string;
};

const AVATAR_PROXY_TOKEN_SIGNATURE_PATTERN = /^[A-Za-z0-9_-]+$/;

function normalizeSigningSecret(secret: string): string {
	return secret.trim();
}

function signAvatarSource(
	source: string,
	timestamp: string,
	secret: string
): string {
	return createHmac('sha256', secret)
		.update(`${source}:${timestamp}`)
		.digest('base64url');
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

function encodeAvatarProxyToken(payload: AvatarProxyTokenPayload): string {
	return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeAvatarProxyToken(
	token: string | null | undefined
): AvatarProxyTokenPayload | null {
	if (typeof token !== 'string' || token.trim() === '') {
		return null;
	}

	try {
		const decoded = Buffer.from(token, 'base64url').toString('utf8');
		const parsed = JSON.parse(decoded) as unknown;
		if (!parsed || typeof parsed !== 'object') {
			return null;
		}

		const record = parsed as Record<string, unknown>;
		if (
			typeof record.source !== 'string' ||
			typeof record.timestamp !== 'string' ||
			typeof record.signature !== 'string'
		) {
			return null;
		}

		return {
			source: record.source,
			timestamp: record.timestamp,
			signature: record.signature
		};
	} catch {
		return null;
	}
}

export function sanitizeAvatarUrl(
	candidate: string | null | undefined
): string | null {
	if (!candidate) {
		return null;
	}

	try {
		const parsed = new URL(candidate);
		if (
			parsed.protocol !== 'https:' ||
			parsed.username ||
			parsed.password ||
			parsed.port ||
			parsed.hash
		) {
			return null;
		}

		if (!isTrustedAvatarHost(parsed.hostname)) {
			return null;
		}

		const sanitized = new URL(parsed.origin);
		sanitized.pathname = parsed.pathname;
		return sanitized.toString();
	} catch {
		return null;
	}
}

export function createAvatarProxyToken(
	candidate: string | null | undefined,
	{ secret, now = Date.now() }: AvatarProxySigningOptions
): string | null {
	const sanitized = sanitizeAvatarUrl(candidate);
	if (!sanitized) {
		return null;
	}

	const normalizedSecret = normalizeSigningSecret(secret);
	if (!normalizedSecret) {
		throw new Error('secret must be a non-empty string');
	}

	const timestamp = String(now);
	return encodeAvatarProxyToken({
		source: sanitized,
		timestamp,
		signature: signAvatarSource(sanitized, timestamp, normalizedSecret)
	});
}

export function readVerifiedAvatarProxySource(
	searchParams: URLSearchParams,
	{ secret, now = Date.now() }: AvatarProxySigningOptions
): string | null {
	const normalizedSecret =
		typeof secret === 'string' ? normalizeSigningSecret(secret) : '';
	if (normalizedSecret === '') {
		return null;
	}

	const token = decodeAvatarProxyToken(
		searchParams.get(AVATAR_PROXY_TOKEN_QUERY_NAME)
	);
	if (!token) {
		return null;
	}
	if (
		!/^\d+$/.test(token.timestamp) ||
		!AVATAR_PROXY_TOKEN_SIGNATURE_PATTERN.test(token.signature)
	) {
		return null;
	}

	const sanitizedSource = sanitizeAvatarUrl(token.source);
	if (!sanitizedSource || sanitizedSource !== token.source) {
		return null;
	}

	const issuedAt = Number(token.timestamp);
	if (!Number.isSafeInteger(issuedAt)) {
		return null;
	}
	if (issuedAt - now > AVATAR_PROXY_TOKEN_MAX_FUTURE_SKEW_MS) {
		return null;
	}
	if (now - issuedAt > AVATAR_PROXY_TOKEN_TTL_MS) {
		return null;
	}

	const expectedSignature = signAvatarSource(
		sanitizedSource,
		token.timestamp,
		normalizedSecret
	);
	if (!signaturesMatch(token.signature, expectedSignature)) {
		return null;
	}

	return sanitizedSource;
}

export function toAvatarProxyUrl(
	candidate: string | null | undefined,
	options: AvatarProxySigningOptions
): string | null {
	const token = createAvatarProxyToken(candidate, options);
	if (!token) {
		return null;
	}

	const params = new URLSearchParams({
		[AVATAR_PROXY_TOKEN_QUERY_NAME]: token
	});
	return `${AVATAR_PROXY_PATH}?${params.toString()}`;
}
