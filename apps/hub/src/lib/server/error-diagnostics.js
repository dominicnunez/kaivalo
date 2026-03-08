const REDACTED_VALUE = '[redacted]';
const SENSITIVE_TEXT_PATTERN =
	/\b((?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|client[_-]?secret|secret|password|oauth\s+code)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const BEARER_TOKEN_PATTERN = /\b(bearer\s+)[^\s,;]+/gi;
const SENSITIVE_QUERY_PATTERN =
	/([?&](?:access_token|refresh_token|id_token|token|api_key|client_secret|code|password)=)[^&#\s]*/gi;
const ERROR_CODE_MAX_LENGTH = 64;
const ERROR_MESSAGE_MAX_LENGTH = 256;

/**
 * @param {string} value
 * @returns {string}
 */
export function redactSensitiveText(value) {
	const collapsedWhitespace = value.replace(/\s+/g, ' ').trim();
	return collapsedWhitespace
		.replace(SENSITIVE_TEXT_PATTERN, `$1${REDACTED_VALUE}`)
		.replace(SENSITIVE_QUERY_PATTERN, `$1${REDACTED_VALUE}`)
		.replace(BEARER_TOKEN_PATTERN, `$1${REDACTED_VALUE}`)
		.slice(0, ERROR_MESSAGE_MAX_LENGTH);
}

/**
 * @param {unknown} error
 * @returns {unknown}
 */
export function getErrorCause(error) {
	if (error instanceof Error && 'cause' in error) {
		return error.cause;
	}

	return undefined;
}

/**
 * @param {unknown} error
 * @returns {string | null}
 */
export function getErrorCode(error) {
	if (!error || typeof error !== 'object' || !('code' in error)) {
		return null;
	}

	const candidateCode = error.code;
	if (typeof candidateCode !== 'string' && typeof candidateCode !== 'number') {
		return null;
	}

	const normalizedCode = String(candidateCode)
		.trim()
		.slice(0, ERROR_CODE_MAX_LENGTH);
	return normalizedCode || null;
}

/**
 * @param {unknown} error
 * @returns {string | null}
 */
function getErrorMessage(error) {
	if (error instanceof Error) {
		return error.message ? redactSensitiveText(error.message) : null;
	}

	if (error === undefined) {
		return null;
	}

	return redactSensitiveText(String(error));
}

/**
 * @param {unknown} error
 * @param {{ includeMessage?: boolean }} [options]
 * @returns {{
 *   errorName: string;
 *   errorUpstreamCode?: string;
 *   errorCauseName?: string;
 *   errorCauseCode?: string;
 *   errorMessage?: string;
 *   errorCauseMessage?: string;
 * }}
 */
export function getErrorLogContext(error, options = {}) {
	const includeMessage = options.includeMessage === true;
	const cause = getErrorCause(error);
	/** @type {{
	 *   errorName: string;
	 *   errorUpstreamCode?: string;
	 *   errorCauseName?: string;
	 *   errorCauseCode?: string;
	 *   errorMessage?: string;
	 *   errorCauseMessage?: string;
	 * }}
	 */
	const context = {
		errorName: error instanceof Error ? error.name : 'UnknownError'
	};

	const upstreamCode = getErrorCode(error);
	if (upstreamCode) {
		context.errorUpstreamCode = upstreamCode;
	}

	if (cause !== undefined) {
		context.errorCauseName =
			cause instanceof Error ? cause.name : 'UnknownError';
		const causeCode = getErrorCode(cause);
		if (causeCode) {
			context.errorCauseCode = causeCode;
		}
	}

	if (includeMessage) {
		const message = getErrorMessage(error);
		if (message) {
			context.errorMessage = message;
		}

		if (cause !== undefined) {
			const causeMessage = getErrorMessage(cause);
			if (causeMessage) {
				context.errorCauseMessage = causeMessage;
			}
		}
	}

	return context;
}

/**
 * @param {unknown} error
 * @param {{ includeSensitiveDetails?: boolean; includeMessage?: boolean }} [options]
 * @returns {{
 *   type: string;
 *   code?: string;
 *   message?: string;
 *   stack?: string;
 *   causeType?: string;
 *   causeMessage?: string;
 * }}
 */
export function getErrorDiagnostics(error, options = {}) {
	const includeSensitiveDetails = options.includeSensitiveDetails === true;
	const includeMessage =
		includeSensitiveDetails || options.includeMessage === true;

	if (error instanceof Error) {
		/** @type {{
		 *   type: string;
		 *   code?: string;
		 *   message?: string;
		 *   stack?: string;
		 *   causeType?: string;
		 *   causeMessage?: string;
		 * }} */
		const details = {
			type: error.name
		};

		const errorCode = getErrorCode(error);
		if (errorCode) {
			details.code = errorCode;
		}

		if (includeMessage) {
			details.message = redactSensitiveText(error.message);
		}

		if (includeSensitiveDetails) {
			if (typeof error.stack === 'string' && error.stack.trim()) {
				details.stack = redactSensitiveText(error.stack);
			}

			const cause = getErrorCause(error);
			if (cause instanceof Error) {
				details.causeType = cause.name;
				details.causeMessage = redactSensitiveText(cause.message);
			} else if (cause !== undefined) {
				details.causeType = typeof cause;
				details.causeMessage = redactSensitiveText(String(cause));
			}
		}

		return details;
	}

	/** @type {{
	 *   type: string;
	 *   message?: string;
	 * }} */
	const details = {
		type: 'NonErrorThrown'
	};
	if (includeMessage) {
		details.message = redactSensitiveText(String(error));
	}
	return details;
}
