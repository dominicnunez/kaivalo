const REDACTED_VALUE = '[redacted]';
const SENSITIVE_FIELD_NAME_PATTERN =
	'(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|client[_-]?secret|secret|password|oauth\\s+code)';
const SENSITIVE_VALUE_PATTERN = `(?:"[^"]*"|'[^']*'|[^\\s,;}\\]]+)`;
const SENSITIVE_TEXT_PATTERN = new RegExp(
	`\\b((${SENSITIVE_FIELD_NAME_PATTERN})\\s*[=:]\\s*)${SENSITIVE_VALUE_PATTERN}`,
	'gi'
);
const SENSITIVE_OBJECT_PATTERN = new RegExp(
	`((?:"|')${SENSITIVE_FIELD_NAME_PATTERN}(?:"|')\\s*:\\s*)${SENSITIVE_VALUE_PATTERN}`,
	'gi'
);
const SENSITIVE_BARE_OBJECT_PATTERN = new RegExp(
	`\\b(${SENSITIVE_FIELD_NAME_PATTERN}\\s*:\\s*)${SENSITIVE_VALUE_PATTERN}`,
	'gi'
);
const SENSITIVE_HEADER_PATTERN =
	/\b((?:cookie|set-cookie|authorization|proxy-authorization)\s*:\s*)(.+?)(?=(?:\s+[A-Za-z][A-Za-z-]*\s*:)|$)/gi;
const BEARER_TOKEN_PATTERN = /\b(bearer\s+)[^\s,;]+/gi;
const SENSITIVE_QUERY_PATTERN =
	/([?&](?:access_token|refresh_token|id_token|token|api_key|client_secret|code|password)=)[^&#\s]*/gi;
const ERROR_CODE_MAX_LENGTH = 64;
const ERROR_MESSAGE_MAX_LENGTH = 256;
const PRODUCTION_NODE_ENV = 'production';

type Env = Record<string, string | undefined>;

export type ErrorLogContext = {
	errorName: string;
	errorUpstreamCode?: string;
	errorCauseName?: string;
	errorCauseCode?: string;
	errorMessage?: string;
	errorCauseMessage?: string;
};

export type ErrorDiagnostics = {
	type: string;
	code?: string;
	message?: string;
	stack?: string;
	causeType?: string;
	causeMessage?: string;
};

type ErrorLogContextOptions = {
	includeMessage?: boolean;
};

type ErrorDiagnosticsOptions = {
	includeSensitiveDetails?: boolean;
	includeMessage?: boolean;
};

export function shouldIncludeErrorMessage(env: Env): boolean {
	return env.NODE_ENV?.trim().toLowerCase() !== PRODUCTION_NODE_ENV;
}

export function redactSensitiveText(value: string): string {
	const collapsedWhitespace = value.replace(/\s+/g, ' ').trim();
	return collapsedWhitespace
		.replace(SENSITIVE_HEADER_PATTERN, `$1${REDACTED_VALUE}`)
		.replace(SENSITIVE_QUERY_PATTERN, `$1${REDACTED_VALUE}`)
		.replace(SENSITIVE_OBJECT_PATTERN, `$1${REDACTED_VALUE}`)
		.replace(SENSITIVE_BARE_OBJECT_PATTERN, `$1${REDACTED_VALUE}`)
		.replace(SENSITIVE_TEXT_PATTERN, `$1${REDACTED_VALUE}`)
		.replace(BEARER_TOKEN_PATTERN, `$1${REDACTED_VALUE}`)
		.slice(0, ERROR_MESSAGE_MAX_LENGTH);
}

export function getErrorCause(error: unknown): unknown {
	if (error instanceof Error && 'cause' in error) {
		return error.cause;
	}

	return undefined;
}

export function getErrorCode(error: unknown): string | null {
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

function getErrorMessage(error: unknown): string | null {
	if (error instanceof Error) {
		return error.message ? redactSensitiveText(error.message) : null;
	}

	if (error === undefined) {
		return null;
	}

	return redactSensitiveText(String(error));
}

export function getErrorLogContext(
	error: unknown,
	options: ErrorLogContextOptions = {}
): ErrorLogContext {
	const includeMessage = options.includeMessage === true;
	const cause = getErrorCause(error);
	const context: ErrorLogContext = {
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

export function getErrorDiagnostics(
	error: unknown,
	options: ErrorDiagnosticsOptions = {}
): ErrorDiagnostics {
	const includeSensitiveDetails = options.includeSensitiveDetails === true;
	const includeMessage =
		includeSensitiveDetails || options.includeMessage === true;

	if (error instanceof Error) {
		const details: ErrorDiagnostics = {
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

	const details: ErrorDiagnostics = {
		type: 'NonErrorThrown'
	};
	if (includeMessage) {
		details.message = redactSensitiveText(String(error));
	}
	return details;
}
