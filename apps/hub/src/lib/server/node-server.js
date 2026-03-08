import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { canonicalizeIpAddress } from './ip-address.js';
import {
	applyBaselineSecurityHeaders,
	applyStaticAssetHeaders,
	getStaticAssetCacheControlForResponse,
	getTrustedForwardedProto,
	getProxyTrustConfiguration,
	getValidatedWorkosEnv,
	shouldApplyStaticAssetHeaders
} from './workos-security.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3000;
const SHUTDOWN_TIMEOUT_MS = 30_000;
const KEEP_ALIVE_TIMEOUT_MS = 5_000;
const HEADERS_TIMEOUT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 30_000;
const FORWARDED_PROTO_WARNING_TTL_MS = 10 * 60 * 1000;
const MAX_FORWARDED_PROTO_WARNING_KEYS = 512;
const PRIVATE_NO_STORE_CACHE_CONTROL = 'private, no-store';
const PRODUCTION_NODE_ENV = 'production';
const REDACTED_VALUE = '[redacted]';
const MIN_PORT = 1;
const MAX_PORT = 65_535;
const SENSITIVE_ASSIGNMENT_PATTERN =
	/\b((?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|client[_-]?secret|secret|password|oauth\s+code)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const BEARER_TOKEN_PATTERN = /\b(bearer\s+)[^\s,;]+/gi;
const SENSITIVE_QUERY_PARAM_PATTERN =
	/([?&](?:access_token|refresh_token|id_token|token|api_key|client_secret|code|password)=)[^&#\s]*/gi;

/**
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
function shouldIncludeSensitiveErrorDetails(env) {
	return env.NODE_ENV?.trim().toLowerCase() !== PRODUCTION_NODE_ENV;
}

/**
 * @param {string | undefined} portValue
 * @returns {number}
 */
function parsePort(portValue) {
	if (portValue === undefined || portValue.trim() === '') {
		return DEFAULT_PORT;
	}
	const normalized = portValue.trim();
	if (!/^\d+$/.test(normalized)) {
		throw new Error(
			`PORT must be an integer between ${MIN_PORT} and ${MAX_PORT}`
		);
	}
	const parsed = Number(normalized);
	if (!Number.isInteger(parsed) || parsed < MIN_PORT || parsed > MAX_PORT) {
		throw new Error(`PORT must be between ${MIN_PORT} and ${MAX_PORT}`);
	}
	return parsed;
}

/**
 * @param {string | undefined} rawValue
 * @param {string} envName
 * @param {number} defaultValue
 * @returns {number}
 */
function parsePositiveIntegerEnvValue(rawValue, envName, defaultValue) {
	if (rawValue === undefined || rawValue.trim() === '') {
		return defaultValue;
	}
	const normalized = rawValue.trim();
	if (!/^\d+$/.test(normalized)) {
		throw new Error(`${envName} must be a positive integer`);
	}
	const parsed = Number(normalized);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`${envName} must be a positive integer`);
	}
	return parsed;
}

/**
 * @param {string} value
 * @returns {string}
 */
function redactSensitiveText(value) {
	return value
		.replace(SENSITIVE_QUERY_PARAM_PATTERN, `$1${REDACTED_VALUE}`)
		.replace(SENSITIVE_ASSIGNMENT_PATTERN, `$1${REDACTED_VALUE}`)
		.replace(BEARER_TOKEN_PATTERN, `$1${REDACTED_VALUE}`);
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} host
 * @param {number} port
 * @returns {string}
 */
function getListeningLogMessage(env, host, port) {
	const internalOrigin = `http://${host}:${port}`;
	const publicOrigin = getValidatedWorkosEnv(env).origin;
	if (publicOrigin === internalOrigin) {
		return `Listening on ${publicOrigin}`;
	}

	return `Listening on internal ${internalOrigin} (public ${publicOrigin})`;
}

/**
 * @param {unknown} error
 * @param {{ includeSensitiveDetails?: boolean }} [options]
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

		const errorCode = /** @type {{ code?: unknown }} */ (error).code;
		if (typeof errorCode === 'string' && errorCode.trim()) {
			details.code = errorCode;
		}

		if (includeSensitiveDetails) {
			details.message = redactSensitiveText(error.message);
			if (typeof error.stack === 'string' && error.stack.trim()) {
				details.stack = redactSensitiveText(error.stack);
			}

			const cause = /** @type {{ cause?: unknown }} */ (error).cause;
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
	if (includeSensitiveDetails) {
		details.message = redactSensitiveText(String(error));
	}
	return details;
}

/**
 * @param {http.IncomingMessage} req
 * @returns {string}
 */
export function getRequestPathname(req) {
	if (!req.url) {
		return '/';
	}

	try {
		return new URL(req.url, 'http://localhost').pathname;
	} catch {
		return '/';
	}
}

/**
 * @param {http.IncomingMessage} req
 * @param {boolean} trustForwardedProto
 * @param {Set<string>} trustedProxyIpSet
 * @returns {{
 *   isSecure: boolean;
 *   ignoredForwardedProto: boolean;
 *   remoteAddress: string;
 *   forwardedProto: string;
 * }}
 */
export function evaluateSecureRequest(
	req,
	trustForwardedProto,
	trustedProxyIpSet
) {
	const remoteAddress = canonicalizeIpAddress(req.socket?.remoteAddress);
	const forwardedProto = getTrustedForwardedProto(
		req.headers['x-forwarded-proto']
	);

	if (trustForwardedProto && forwardedProto) {
		if (remoteAddress && trustedProxyIpSet.has(remoteAddress)) {
			return {
				isSecure: forwardedProto === 'https',
				ignoredForwardedProto: false,
				remoteAddress,
				forwardedProto
			};
		}

		return {
			isSecure: req.socket
				? 'encrypted' in req.socket && req.socket.encrypted === true
				: false,
			ignoredForwardedProto: true,
			remoteAddress,
			forwardedProto
		};
	}

	return {
		isSecure: req.socket
			? 'encrypted' in req.socket && req.socket.encrypted === true
			: false,
		ignoredForwardedProto: false,
		remoteAddress,
		forwardedProto
	};
}

/**
 * @param {http.IncomingMessage} req
 * @param {unknown} error
 * @param {Record<string, string | undefined>} env
 * @returns {{ incidentId: string; method?: string; pathname: string; error: ReturnType<typeof getErrorDiagnostics> }}
 */
export function buildRequestFailureLog(req, error, env) {
	const incidentId = randomUUID();
	return {
		incidentId,
		method: req.method,
		pathname: getRequestPathname(req),
		error: getErrorDiagnostics(error, {
			includeSensitiveDetails: shouldIncludeSensitiveErrorDetails(env)
		})
	};
}

/**
 * @param {{
 *   handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;
 *   env: Record<string, string | undefined>;
 *   logger?: Pick<Console, 'log' | 'warn' | 'error'>;
 *   onFatal?: (details: {
 *     exitCode: number;
 *     reason: 'startup-error' | 'shutdown-timeout';
 *     host?: string;
 *     port?: number;
 *     activeRequests?: number;
 *     shutdownTimeoutMs?: number;
 *     error?: ReturnType<typeof getErrorDiagnostics>;
 *   }) => void;
 * }} options
 */
export function createHubServer(options) {
	const logger = options.logger ?? console;
	const workosEnv = getValidatedWorkosEnv(options.env);
	const { trustForwardedProto, trustedProxyIps } = getProxyTrustConfiguration(
		options.env,
		workosEnv.origin
	);
	const trustedProxyIpSet = new Set(trustedProxyIps);

	let activeRequests = 0;
	let shuttingDown = false;
	const activeSockets = new Set();
	const forwardedProtoWarningKeys = new Map();
	/** @type {Promise<number> | null} */
	let shutdownPromise = null;
	/** @type {((exitCode: number) => void) | null} */
	let resolveShutdown = null;

	/**
	 * @param {{
	 *   exitCode: number;
	 *   reason: 'startup-error' | 'shutdown-timeout';
	 *   host?: string;
	 *   port?: number;
	 *   activeRequests?: number;
	 *   shutdownTimeoutMs?: number;
	 *   error?: ReturnType<typeof getErrorDiagnostics>;
	 * }} details
	 */
	function notifyFatal(details) {
		if (!options.onFatal) {
			return;
		}

		try {
			options.onFatal(details);
		} catch (error) {
			logger.error('Fatal handler threw', {
				error: getErrorDiagnostics(error, {
					includeSensitiveDetails: shouldIncludeSensitiveErrorDetails(
						options.env
					)
				})
			});
		}
	}

	/**
	 * @param {number} now
	 */
	function pruneStaleForwardedProtoWarnings(now) {
		for (const [key, timestamp] of forwardedProtoWarningKeys.entries()) {
			if (now - timestamp > FORWARDED_PROTO_WARNING_TTL_MS) {
				forwardedProtoWarningKeys.delete(key);
			}
		}
	}

	/**
	 * @param {string} key
	 * @returns {boolean}
	 */
	function shouldLogForwardedProtoWarning(key) {
		const now = Date.now();
		const lastLoggedAt = forwardedProtoWarningKeys.get(key);
		if (
			typeof lastLoggedAt === 'number' &&
			now - lastLoggedAt <= FORWARDED_PROTO_WARNING_TTL_MS
		) {
			return false;
		}

		pruneStaleForwardedProtoWarnings(now);

		if (forwardedProtoWarningKeys.size >= MAX_FORWARDED_PROTO_WARNING_KEYS) {
			const oldestKey = forwardedProtoWarningKeys.keys().next().value;
			if (oldestKey) {
				forwardedProtoWarningKeys.delete(oldestKey);
			}
		}
		forwardedProtoWarningKeys.set(key, now);
		return true;
	}

	const server = http.createServer((req, res) => {
		const secureRequest = evaluateSecureRequest(
			req,
			trustForwardedProto,
			trustedProxyIpSet
		);

		if (shuttingDown) {
			res.statusCode = 503;
			res.setHeader('Connection', 'close');
			applyBaselineSecurityHeaders(res, secureRequest.isSecure);
			res.setHeader('Cache-Control', PRIVATE_NO_STORE_CACHE_CONTROL);
			res.end('Server is shutting down');
			return;
		}

		const pathname = getRequestPathname(req);
		const isStaticAssetRequest = shouldApplyStaticAssetHeaders(pathname);
		let responseHeadersApplied = false;

		/**
		 * @param {http.OutgoingHttpHeaders | http.OutgoingHttpHeader[] | null | undefined} headerSource
		 * @param {string} headerName
		 * @returns {string | string[] | number | undefined}
		 */
		const getHeaderFromSource = (headerSource, headerName) => {
			if (!headerSource) {
				return undefined;
			}

			const normalizedHeaderName = headerName.toLowerCase();
			if (Array.isArray(headerSource)) {
				for (let index = 0; index < headerSource.length - 1; index += 2) {
					if (
						String(headerSource[index]).toLowerCase() === normalizedHeaderName
					) {
						return headerSource[index + 1];
					}
				}
				return undefined;
			}

			for (const [key, value] of Object.entries(headerSource)) {
				if (key.toLowerCase() === normalizedHeaderName) {
					return value;
				}
			}
			return undefined;
		};

		/**
		 * @param {readonly unknown[]} args
		 * @returns {{
		 *   statusCode: number | undefined;
		 *   headerSource: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[] | undefined;
		 * }}
		 */
		const getWriteHeadOptions = (args) => {
			const statusCode = typeof args[0] === 'number' ? args[0] : undefined;
			const secondArgument = args[1];
			const thirdArgument = args[2];
			const headerSource =
				args.length === 2 &&
				secondArgument !== undefined &&
				typeof secondArgument !== 'string'
					? /** @type {http.OutgoingHttpHeaders | http.OutgoingHttpHeader[]} */ (
							secondArgument
						)
					: args.length >= 3 && thirdArgument !== undefined
						? /** @type {http.OutgoingHttpHeaders | http.OutgoingHttpHeader[]} */ (
								thirdArgument
							)
						: undefined;
			return {
				statusCode,
				headerSource
			};
		};

		/**
		 * @param {{
		 *   headerSource?: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[] | null | undefined;
		 *   statusCode?: number | undefined;
		 * }} [options]
		 */
		const applyResponseSecurityHeaders = (options = {}) => {
			if (responseHeadersApplied || res.headersSent) {
				return;
			}
			responseHeadersApplied = true;
			applyBaselineSecurityHeaders(res, secureRequest.isSecure);
			if (isStaticAssetRequest) {
				const headerSource = options.headerSource;
				const responseStatusCode = options.statusCode ?? res.statusCode;
				const contentTypeHeader =
					getHeaderFromSource(headerSource, 'content-type') ??
					res.getHeader('Content-Type');
				const contentType =
					typeof contentTypeHeader === 'string'
						? contentTypeHeader
						: Array.isArray(contentTypeHeader)
							? (contentTypeHeader.find((value) => typeof value === 'string') ??
								null)
							: null;
				const hasSetCookie =
					getHeaderFromSource(headerSource, 'set-cookie') !== undefined ||
					res.getHeader('Set-Cookie') !== undefined;
				const hasCacheControl =
					getHeaderFromSource(headerSource, 'cache-control') !== undefined ||
					res.hasHeader('Cache-Control');
				const staticCacheControl = getStaticAssetCacheControlForResponse({
					pathname,
					statusCode: responseStatusCode,
					contentType,
					hasSetCookie
				});
				if (staticCacheControl && !hasCacheControl) {
					applyStaticAssetHeaders(res, pathname, secureRequest.isSecure);
				}
			}

			if (secureRequest.ignoredForwardedProto) {
				const warningKey = `${secureRequest.remoteAddress || 'unknown'}|${secureRequest.forwardedProto || 'unknown'}`;
				if (shouldLogForwardedProtoWarning(warningKey)) {
					logger.warn(
						'Ignoring x-forwarded-proto from untrusted proxy address',
						{
							pathname,
							remoteAddress: secureRequest.remoteAddress || 'unknown',
							forwardedProto: secureRequest.forwardedProto || 'unknown'
						}
					);
				}
			}
		};

		const originalWriteHead = res.writeHead.bind(res);
		const patchedWriteHead =
			/** @type {typeof res.writeHead} */
			(
				(...args) => {
					applyResponseSecurityHeaders(getWriteHeadOptions(args));
					return Reflect.apply(originalWriteHead, res, args);
				}
			);
		res.writeHead = patchedWriteHead;

		const originalWrite = res.write.bind(res);
		const patchedWrite =
			/** @type {typeof res.write} */
			(
				(...args) => {
					applyResponseSecurityHeaders();
					return Reflect.apply(originalWrite, res, args);
				}
			);
		res.write = patchedWrite;

		const originalEnd = res.end.bind(res);
		const patchedEnd =
			/** @type {typeof res.end} */
			(
				(...args) => {
					applyResponseSecurityHeaders();
					return Reflect.apply(originalEnd, res, args);
				}
			);
		res.end = patchedEnd;

		const originalFlushHeaders = res.flushHeaders?.bind(res);
		if (originalFlushHeaders) {
			const patchedFlushHeaders =
				/** @type {typeof res.flushHeaders} */
				(
					(...args) => {
						applyResponseSecurityHeaders();
						return Reflect.apply(originalFlushHeaders, res, args);
					}
				);
			res.flushHeaders = patchedFlushHeaders;
		}

		activeRequests += 1;
		let settled = false;
		const finalizeRequest = () => {
			if (settled) {
				return;
			}
			settled = true;
			activeRequests = Math.max(0, activeRequests - 1);
		};
		res.once('finish', finalizeRequest);
		res.once('close', finalizeRequest);

		/**
		 * @param {unknown} error
		 */
		const handleRequestFailure = (error) => {
			if (!res.headersSent) {
				res.statusCode = 500;
				res.setHeader('Content-Type', 'text/plain; charset=utf-8');
				applyBaselineSecurityHeaders(res, secureRequest.isSecure);
				res.setHeader('Cache-Control', PRIVATE_NO_STORE_CACHE_CONTROL);
				if (!res.writableEnded) {
					res.end('Internal Server Error');
				}
			} else if (!res.writableEnded && !res.destroyed) {
				res.destroy(
					error instanceof Error
						? error
						: new Error('Request handler failed after response started')
				);
			}
			logger.error(
				'Request handler failed',
				buildRequestFailureLog(req, error, options.env)
			);
		};

		try {
			Promise.resolve(options.handler(req, res)).catch(handleRequestFailure);
		} catch (error) {
			handleRequestFailure(error);
		}
	});

	server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
	server.headersTimeout = HEADERS_TIMEOUT_MS;
	server.requestTimeout = REQUEST_TIMEOUT_MS;
	server.on('connection', (socket) => {
		activeSockets.add(socket);
		socket.once('close', () => {
			activeSockets.delete(socket);
		});
	});

	const effectiveShutdownTimeoutMs = parsePositiveIntegerEnvValue(
		options.env.SHUTDOWN_TIMEOUT_MS,
		'SHUTDOWN_TIMEOUT_MS',
		SHUTDOWN_TIMEOUT_MS
	);

	function beginShutdown() {
		if (shutdownPromise) {
			return shutdownPromise;
		}

		shutdownPromise = new Promise((resolve) => {
			resolveShutdown = resolve;
		});
		shuttingDown = true;
		let shutdownComplete = false;

		/**
		 * @param {number} exitCode
		 */
		const completeShutdown = (exitCode) => {
			if (shutdownComplete) {
				return;
			}
			shutdownComplete = true;
			resolveShutdown?.(exitCode);
		};

		server.close(() => {
			completeShutdown(0);
		});

		setTimeout(() => {
			if (activeSockets.size > 0) {
				for (const socket of activeSockets) {
					socket.destroy();
				}
				notifyFatal({
					exitCode: 1,
					reason: 'shutdown-timeout',
					activeRequests,
					shutdownTimeoutMs: effectiveShutdownTimeoutMs
				});
				completeShutdown(1);
			}
		}, effectiveShutdownTimeoutMs).unref();

		return shutdownPromise;
	}

	return { server, beginShutdown };
}

/**
 * @param {{
 *   handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;
 *   env?: Record<string, string | undefined>;
 *   logger?: Pick<Console, 'log' | 'warn' | 'error'>;
 *   onFatal?: (details: {
 *     exitCode: number;
 *     reason: 'startup-error' | 'shutdown-timeout';
 *     host?: string;
 *     port?: number;
 *     activeRequests?: number;
 *     shutdownTimeoutMs?: number;
 *     error?: ReturnType<typeof getErrorDiagnostics>;
 *   }) => void;
 * }} options
 */
export function startHubServer(options) {
	const env = options.env ?? process.env;
	const host = env.HOST || DEFAULT_HOST;
	const logger = options.logger ?? console;
	let port = DEFAULT_PORT;
	/** @type {http.Server | null} */
	let server = null;
	/** @type {() => Promise<number>} */
	let beginShutdown = () => Promise.resolve(0);
	/** @type {() => void} */
	let handleSigInt = () => {};
	/** @type {() => void} */
	let handleSigTerm = () => {};
	let processListenersCleanedUp = false;

	const cleanupProcessListeners = () => {
		if (processListenersCleanedUp) {
			return;
		}
		processListenersCleanedUp = true;
		process.off('SIGINT', handleSigInt);
		process.off('SIGTERM', handleSigTerm);
	};

	/**
	 * @param {unknown} error
	 */
	const handleStartupError = (error) => {
		cleanupProcessListeners();
		const diagnostics = getErrorDiagnostics(error, {
			includeSensitiveDetails: shouldIncludeSensitiveErrorDetails(env)
		});
		logger.error('Failed to start hub server', {
			host,
			port,
			error: diagnostics
		});
		if (options.onFatal) {
			options.onFatal({
				exitCode: 1,
				reason: 'startup-error',
				host,
				port,
				error: diagnostics
			});
		}
	};

	try {
		port = parsePort(env.PORT);
		({ server, beginShutdown } = createHubServer({
			handler: options.handler,
			env,
			logger,
			onFatal: options.onFatal
		}));
	} catch (error) {
		handleStartupError(error);
		return null;
	}

	handleSigInt = () => {
		void beginShutdown();
	};
	handleSigTerm = () => {
		void beginShutdown();
	};
	process.on('SIGINT', handleSigInt);
	process.on('SIGTERM', handleSigTerm);

	server.once('close', cleanupProcessListeners);

	const handleListening = () => {
		server.off('error', handleStartupError);
		logger.log(getListeningLogMessage(env, host, port));
	};

	server.once('error', handleStartupError);
	server.once('listening', handleListening);

	server.listen(port, host);

	return server;
}
