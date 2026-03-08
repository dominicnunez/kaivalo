export const REDIRECT_RESPONSE_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * @param {unknown} value
 * @returns {value is { status: number; location: string }}
 */
export function isRedirectLikeObject(value) {
	return Boolean(
		value &&
		typeof value === 'object' &&
		'status' in value &&
		'location' in value &&
		typeof value.status === 'number' &&
		typeof value.location === 'string'
	);
}

/**
 * @param {string} location
 * @param {string} requestOrigin
 * @returns {string | null}
 */
export function normalizeSameOriginRedirectLocation(location, requestOrigin) {
	if (location.trim() !== location || location.length === 0) {
		return null;
	}

	if (location.startsWith('/')) {
		if (location.startsWith('//') || location.startsWith('/\\')) {
			return null;
		}

		const parsedRelative = new URL(location, requestOrigin);
		if (parsedRelative.origin !== requestOrigin) {
			return null;
		}

		return (
			parsedRelative.pathname + parsedRelative.search + parsedRelative.hash
		);
	}

	let parsed;
	try {
		parsed = new URL(location);
	} catch {
		return null;
	}

	if (parsed.origin !== requestOrigin || parsed.username || parsed.password) {
		return null;
	}

	return parsed.pathname + parsed.search + parsed.hash;
}
