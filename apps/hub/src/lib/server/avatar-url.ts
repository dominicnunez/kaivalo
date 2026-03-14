import { isTrustedAvatarHost } from './trusted-hosts.ts';

export const AVATAR_PROXY_PATH = '/avatar';

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
		sanitized.search = parsed.search;
		return sanitized.toString();
	} catch {
		return null;
	}
}

export function toAvatarProxyUrl(
	candidate: string | null | undefined
): string | null {
	const sanitized = sanitizeAvatarUrl(candidate);
	if (!sanitized) {
		return null;
	}

	const params = new URLSearchParams({ source: sanitized });
	return `${AVATAR_PROXY_PATH}?${params.toString()}`;
}
