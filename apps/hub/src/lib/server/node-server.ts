import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { canonicalizeIpAddress } from './ip-address.ts';
import {
	getErrorDiagnostics,
	type ErrorDiagnostics
} from './error-diagnostics.ts';
import {
	applyBaselineSecurityHeaders,
	applyStaticAssetHeaders,
	getStaticAssetCacheControlForResponse,
	getTrustedForwardedProto,
	getProxyTrustConfiguration,
	getValidatedWorkosEnv,
	shouldApplyStaticAssetHeaders
} from './workos-security.ts';

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
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const MIN_PORT = 1;
const MAX_PORT = 65_535;

export { getErrorDiagnostics } from './error-diagnostics.ts';

type Env = Record<string, string | undefined>;

type FatalReason = 'startup-error' | 'shutdown-timeout';

type FatalDetails = {
	exitCode: number;
	reason: FatalReason;
	host?: string;
	port?: number;
	configuredPort?: string;
	activeRequests?: number;
	shutdownTimeoutMs?: number;
	error?: ErrorDiagnostics;
};

type FatalNotifierOptions = {
	onFatal?: (details: FatalDetails) => void;
	logger: Pick<Console, 'error'>;
	env: Env;
};

type HubServerOptions = {
	handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;
	env: Env;
	logger?: Pick<Console, 'log' | 'warn' | 'error'>;
	onFatal?: (details: FatalDetails) => void;
};

type StartHubServerOptions = {
	handler: (req: http.IncomingMessage, res: http.ServerResponse) => void;
	env?: Env;
	logger?: Pick<Console, 'log' | 'warn' | 'error'>;
	onFatal?: (details: FatalDetails) => void;
};

type SecureRequestEvaluation = {
	isSecure: boolean;
	ignoredForwardedProto: boolean;
	remoteAddress: string;
	forwardedProto: string;
};

type WriteHeadOptions = {
	statusCode: number | undefined;
	headerSource:
		| http.OutgoingHttpHeaders
		| http.OutgoingHttpHeader[]
		| undefined;
};

type ResponseSecurityHeaderOptions = {
	headerSource?: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[] | null;
	statusCode?: number;
};

function shouldIncludeSensitiveErrorDetails(env: Env): boolean {
	return env.NODE_ENV?.trim().toLowerCase() !== PRODUCTION_NODE_ENV;
}

function getFatalErrorDiagnostics(error: unknown, env: Env): ErrorDiagnostics {
	return getErrorDiagnostics(error, {
		includeSensitiveDetails: shouldIncludeSensitiveErrorDetails(env),
		includeMessage: true
	});
}

/**
 * @param {{
 *   onFatal?: (details: {
 *     exitCode: number;
 *     reason: 'startup-error' | 'shutdown-timeout';
 *     host?: string;
 *     port?: number;
 *     configuredPort?: string;
 *     activeRequests?: number;
 *     shutdownTimeoutMs?: number;
 *     error?: ReturnType<typeof getErrorDiagnostics>;
 *   }) => void;
 *   logger: Pick<Console, 'error'>;
 *   env: Record<string, string | undefined>;
 * }} options
 * @returns {(details: {
 *   exitCode: number;
 *   reason: 'startup-error' | 'shutdown-timeout';
 *   host?: string;
 *   port?: number;
 *   configuredPort?: string;
 *   activeRequests?: number;
 *   shutdownTimeoutMs?: number;
 *   error?: ReturnType<typeof getErrorDiagnostics>;
 * }) => void}
 */
function createFatalNotifier({
	onFatal,
	logger,
	env
}: FatalNotifierOptions): (details: FatalDetails) => void {
	return (details: FatalDetails) => {
		if (!onFatal) {
			return;
		}

		try {
			onFatal(details);
		} catch (error) {
			logger.error('Fatal handler threw', {
				error: getFatalErrorDiagnostics(error, env)
			});
		}
	};
}

/**
 * @param {string | undefined} portValue
 * @returns {number}
 */
function parsePort(portValue: string | undefined): number {
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
 * @param {number} [maxValue]
 * @returns {number}
 */
function parsePositiveIntegerEnvValue(
	rawValue: string | undefined,
	envName: string,
	defaultValue: number,
	maxValue?: number
): number {
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
	if (maxValue !== undefined && parsed > maxValue) {
		throw new Error(`${envName} must be less than or equal to ${maxValue}`);
	}
	return parsed;
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} host
 * @param {number} port
 * @returns {string}
 */
function getListeningLogMessage(env: Env, host: string, port: number): string {
	const internalOrigin = `http://${host}:${port}`;
	const publicOrigin = getValidatedWorkosEnv(env).origin;
	if (publicOrigin === internalOrigin) {
		return `Listening on ${publicOrigin}`;
	}

	return `Listening on internal ${internalOrigin} (public ${publicOrigin})`;
}

/**
 * @param {http.IncomingMessage} req
 * @returns {string}
 */
export function getRequestPathname(req: http.IncomingMessage): string {
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
	req: http.IncomingMessage,
	trustForwardedProto: boolean,
	trustedProxyIpSet: Set<string>
): SecureRequestEvaluation {
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
export function buildRequestFailureLog(
	req: http.IncomingMessage,
	error: unknown,
	env: Env
): {
	incidentId: string;
	method?: string;
	pathname: string;
	error: ErrorDiagnostics;
} {
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
 *     configuredPort?: string;
 *     activeRequests?: number;
 *     shutdownTimeoutMs?: number;
 *     error?: ReturnType<typeof getErrorDiagnostics>;
 *   }) => void;
 * }} options
 */
export function createHubServer(options: HubServerOptions): {
	server: http.Server;
	beginShutdown: () => Promise<number>;
} {
	const logger = options.logger ?? console;
	const workosEnv = getValidatedWorkosEnv(options.env);
	const { trustForwardedProto, trustedProxyIps } = getProxyTrustConfiguration(
		options.env,
		workosEnv.origin
	);
	const notifyFatal = createFatalNotifier({
		onFatal: options.onFatal,
		logger,
		env: options.env
	});
	const trustedProxyIpSet = new Set(trustedProxyIps);

	let activeRequests = 0;
	let shuttingDown = false;
	const activeSockets = new Set<import('node:net').Socket>();
	const forwardedProtoWarningKeys = new Map<string, number>();
	let shutdownPromise: Promise<number> | null = null;
	let resolveShutdown: ((exitCode: number) => void) | null = null;

	function pruneStaleForwardedProtoWarnings(now: number): void {
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
	function shouldLogForwardedProtoWarning(key: string): boolean {
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
			const oldestKey = forwardedProtoWarningKeys.keys().next().value as
				| string
				| undefined;
			if (oldestKey !== undefined) {
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
		const getHeaderFromSource = (
			headerSource:
				| http.OutgoingHttpHeaders
				| http.OutgoingHttpHeader[]
				| null
				| undefined,
			headerName: string
		): string | string[] | number | undefined => {
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
		const getWriteHeadOptions = (
			args: readonly unknown[]
		): WriteHeadOptions => {
			const statusCode = typeof args[0] === 'number' ? args[0] : undefined;
			const secondArgument = args[1];
			const thirdArgument = args[2];
			const headerSource: WriteHeadOptions['headerSource'] =
				args.length === 2 &&
				secondArgument !== undefined &&
				typeof secondArgument !== 'string'
					? (secondArgument as
							| http.OutgoingHttpHeaders
							| http.OutgoingHttpHeader[])
					: args.length >= 3 && thirdArgument !== undefined
						? (thirdArgument as
								| http.OutgoingHttpHeaders
								| http.OutgoingHttpHeader[])
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
		const applyResponseSecurityHeaders = (
			options: ResponseSecurityHeaderOptions = {}
		): void => {
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
							? (contentTypeHeader.find(
									(value): value is string => typeof value === 'string'
								) ?? null)
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
		const patchedWriteHead: typeof res.writeHead = (...args) => {
			applyResponseSecurityHeaders(getWriteHeadOptions(args));
			return Reflect.apply(originalWriteHead, res, args);
		};
		res.writeHead = patchedWriteHead;

		const originalWrite = res.write.bind(res);
		const patchedWrite: typeof res.write = (...args) => {
			applyResponseSecurityHeaders();
			return Reflect.apply(originalWrite, res, args);
		};
		res.write = patchedWrite;

		const originalEnd = res.end.bind(res);
		const patchedEnd = ((...args: Parameters<typeof res.end>) => {
			applyResponseSecurityHeaders();
			return Reflect.apply(originalEnd, res, args);
		}) as typeof res.end;
		res.end = patchedEnd;

		const originalFlushHeaders = res.flushHeaders?.bind(res);
		if (originalFlushHeaders) {
			const patchedFlushHeaders: typeof res.flushHeaders = (...args) => {
				applyResponseSecurityHeaders();
				return Reflect.apply(originalFlushHeaders, res, args);
			};
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
		const handleRequestFailure = (error: unknown): void => {
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
		SHUTDOWN_TIMEOUT_MS,
		MAX_TIMER_DELAY_MS
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
		const completeShutdown = (exitCode: number): void => {
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
 * @returns {Promise<http.Server | null>}
 */
export function startHubServer(
	options: StartHubServerOptions
): Promise<http.Server | null> {
	const env = options.env ?? process.env;
	const host = env.HOST || DEFAULT_HOST;
	const configuredPort =
		env.PORT === undefined || env.PORT.trim() === ''
			? undefined
			: env.PORT.trim();
	const logger = options.logger ?? console;
	const notifyFatal = createFatalNotifier({
		onFatal: options.onFatal,
		logger,
		env
	});
	let port: number | undefined;
	let server: http.Server | null = null;
	let beginShutdown: () => Promise<number> = () => Promise.resolve(0);
	let handleSigInt = (): void => {};
	let handleSigTerm = (): void => {};
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
	const handleStartupError = (error: unknown): void => {
		cleanupProcessListeners();
		const diagnostics = getFatalErrorDiagnostics(error, env);
		const portDetails =
			port === undefined
				? configuredPort === undefined
					? {}
					: { configuredPort }
				: { port };
		logger.error('Failed to start hub server', {
			host,
			...portDetails,
			error: diagnostics
		});
		notifyFatal({
			exitCode: 1,
			reason: 'startup-error',
			host,
			...portDetails,
			error: diagnostics
		});
	};

	return new Promise((resolve) => {
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
			resolve(null);
			return;
		}
		if (port === undefined) {
			handleStartupError(
				new Error('PORT must be parsed before server startup')
			);
			resolve(null);
			return;
		}
		const startedServer = server;
		const listeningPort = port;

		handleSigInt = () => {
			void beginShutdown();
		};
		handleSigTerm = () => {
			void beginShutdown();
		};
		process.on('SIGINT', handleSigInt);
		process.on('SIGTERM', handleSigTerm);

		startedServer.once('close', cleanupProcessListeners);

		const handleListening = () => {
			startedServer.off('error', handleListenError);
			logger.log(getListeningLogMessage(env, host, listeningPort));
			resolve(startedServer);
		};

		/**
		 * @param {unknown} error
		 */
		const handleListenError = (error: unknown): void => {
			startedServer.off('listening', handleListening);
			handleStartupError(error);
			resolve(null);
		};

		startedServer.once('error', handleListenError);
		startedServer.once('listening', handleListening);

		try {
			startedServer.listen(listeningPort, host);
		} catch (error) {
			handleListenError(error);
		}
	});
}
