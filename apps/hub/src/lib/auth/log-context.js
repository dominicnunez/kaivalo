const REQUEST_ID_MAX_LENGTH = 64;
const REQUEST_ID_ALLOWED_CHARS = /^[A-Za-z0-9_-]+$/;

/**
 * @param {string | null} requestId
 * @returns {string}
 */
export function normalizeRequestId(requestId) {
	if (!requestId) {
		return 'missing';
	}

	const trimmed = requestId.trim();
	if (!trimmed) {
		return 'missing';
	}

	if (
		trimmed.length <= REQUEST_ID_MAX_LENGTH &&
		REQUEST_ID_ALLOWED_CHARS.test(trimmed)
	) {
		return trimmed;
	}

	const normalized = trimmed
		.replace(/[^A-Za-z0-9_-]/g, '_')
		.slice(0, REQUEST_ID_MAX_LENGTH);
	return normalized || 'invalid';
}

/**
 * @param {unknown} err
 * @returns {string}
 */
export function getErrorName(err) {
	if (err instanceof Error) {
		return err.name;
	}

	return 'UnknownError';
}
