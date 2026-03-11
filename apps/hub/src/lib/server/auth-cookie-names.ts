import { AUTHKIT_COOKIE_NAME } from './authkit-config.ts';

const COOKIE_NAME_PREFIXES = ['__secure-', '__host-'];

function removeCookiePrefix(cookieName: string): string {
	for (const prefix of COOKIE_NAME_PREFIXES) {
		if (cookieName.startsWith(prefix)) {
			return cookieName.slice(prefix.length);
		}
	}

	return cookieName;
}

export function getSensitiveAuthCookieNames(
	cookieName = AUTHKIT_COOKIE_NAME
): Set<string> {
	const normalizedCookieName = String(cookieName).trim().toLowerCase();
	if (!normalizedCookieName) {
		return new Set();
	}

	const baseCookieName = removeCookiePrefix(normalizedCookieName);
	return new Set([
		baseCookieName,
		normalizedCookieName,
		...COOKIE_NAME_PREFIXES.map((prefix) => `${prefix}${baseCookieName}`)
	]);
}

export const SENSITIVE_AUTH_COOKIE_NAMES = getSensitiveAuthCookieNames();
