export const REDIRECT_RESPONSE_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_PERCENT_DECODING_PASSES = 4;

export type RedirectLikeObject = {
	status: number;
	location: string;
};

function decodePercentEscapes(value: string): string {
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

function hasUnsafeRelativeRedirectPrefix(location: string): boolean {
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

function hasControlCharacters(value: string): boolean {
	for (let index = 0; index < value.length; index += 1) {
		const codePoint = value.charCodeAt(index);
		if (codePoint <= 0x1f || codePoint === 0x7f) {
			return true;
		}
	}

	return false;
}

function normalizeTrustedOrigin(value: string): string {
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

export function isRedirectLikeObject(
	value: unknown
): value is RedirectLikeObject {
	return Boolean(
		value &&
		typeof value === 'object' &&
		'status' in value &&
		'location' in value &&
		typeof value.status === 'number' &&
		typeof value.location === 'string'
	);
}

export function normalizeSameOriginRedirectLocation(
	location: string,
	requestOrigin: string
): string | null {
	return normalizeTrustedRedirectLocation(location, requestOrigin);
}

export function normalizeTrustedRedirectLocation(
	location: string,
	requestOrigin: string,
	trustedOrigins: Iterable<string> = []
): string | null {
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
