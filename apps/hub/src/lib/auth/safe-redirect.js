export const REDIRECT_RESPONSE_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeTrustedOrigin(value) {
	let parsed;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error('Trusted redirect origins must be valid URL origins');
	}

	if (
		parsed.username ||
		parsed.password ||
		parsed.pathname !== '/' ||
		parsed.search ||
		parsed.hash
	) {
		throw new Error('Trusted redirect origins must be valid URL origins');
	}

	return parsed.origin;
}

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
	return normalizeTrustedRedirectLocation(location, requestOrigin);
}

/**
 * @param {string} location
 * @param {string} requestOrigin
 * @param {Iterable<string>} [trustedOrigins]
 * @returns {string | null}
 */
export function normalizeTrustedRedirectLocation(
	location,
	requestOrigin,
	trustedOrigins = []
) {
	if (location.trim() !== location || location.length === 0) {
		return null;
	}

	const normalizedRequestOrigin = normalizeTrustedOrigin(requestOrigin);
	const allowedOrigins = new Set([normalizedRequestOrigin]);
	for (const origin of trustedOrigins) {
		allowedOrigins.add(normalizeTrustedOrigin(origin));
	}

	if (location.startsWith('/')) {
		if (location.startsWith('//') || location.startsWith('/\\')) {
			return null;
		}

		const parsedRelative = new URL(location, normalizedRequestOrigin);
		if (parsedRelative.origin !== normalizedRequestOrigin) {
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

	if (
		parsed.username ||
		parsed.password ||
		!allowedOrigins.has(parsed.origin)
	) {
		return null;
	}

	if (parsed.origin === normalizedRequestOrigin) {
		return parsed.pathname + parsed.search + parsed.hash;
	}

	return parsed.toString();
}
