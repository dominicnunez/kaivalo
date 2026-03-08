export const REDIRECT_RESPONSE_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_PERCENT_DECODING_PASSES = 4;

/**
 * Decode nested percent-encoding for validation purposes.
 *
 * @param {string} value
 * @returns {string}
 */
function decodePercentEscapes(value) {
	let decoded = value;
	for (let index = 0; index < MAX_PERCENT_DECODING_PASSES; index += 1) {
		let next;
		try {
			next = decodeURIComponent(decoded);
		} catch {
			return decoded;
		}

		if (next === decoded) {
			return decoded;
		}

		decoded = next;
	}

	return decoded;
}

/**
 * @param {string} location
 * @returns {boolean}
 */
function hasUnsafeRelativeRedirectPrefix(location) {
	const decodedLocation = decodePercentEscapes(location);
	if (hasControlCharacters(decodedLocation)) {
		return true;
	}

	if (decodedLocation.startsWith('//') || decodedLocation.startsWith('/\\')) {
		return true;
	}

	const postRootPrefix = decodedLocation.slice(1).trimStart();
	return postRootPrefix.startsWith('/') || postRootPrefix.startsWith('\\');
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function hasControlCharacters(value) {
	for (let index = 0; index < value.length; index += 1) {
		const codePoint = value.charCodeAt(index);
		if (codePoint <= 0x1f || codePoint === 0x7f) {
			return true;
		}
	}

	return false;
}

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
		if (hasUnsafeRelativeRedirectPrefix(location)) {
			return null;
		}

		const parsedRelative = new URL(location, normalizedRequestOrigin);
		if (parsedRelative.origin !== normalizedRequestOrigin) {
			return null;
		}

		if (hasUnsafeRelativeRedirectPrefix(parsedRelative.pathname)) {
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

	if (hasUnsafeRelativeRedirectPrefix(parsed.pathname)) {
		return null;
	}

	if (parsed.origin === normalizedRequestOrigin) {
		return parsed.pathname + parsed.search + parsed.hash;
	}

	return parsed.toString();
}
