import { AUTHKIT_COOKIE_NAME } from './authkit-config.js';

const COOKIE_NAME_PREFIXES = ['', '__secure-', '__host-'];

export function getSensitiveAuthCookieNames(cookieName = AUTHKIT_COOKIE_NAME) {
	const normalizedCookieName = String(cookieName).trim().toLowerCase();
	return new Set(
		COOKIE_NAME_PREFIXES.map((prefix) => `${prefix}${normalizedCookieName}`)
	);
}

export const SENSITIVE_AUTH_COOKIE_NAMES = getSensitiveAuthCookieNames();
