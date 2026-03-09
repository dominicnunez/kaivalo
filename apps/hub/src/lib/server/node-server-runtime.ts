import http from 'node:http';
import { isIP, type Socket } from 'node:net';
import {
	getErrorDiagnostics,
	type ErrorDiagnostics
} from './error-diagnostics.ts';
import {
	applyBaselineSecurityHeaders,
	applyStaticAssetHeaders,
	getProxyTrustConfiguration,
	getStaticAssetCacheControlForResponse,
	getValidatedWorkosEnv,
	shouldApplyStaticAssetHeaders
} from './workos-security.ts';
import {
	buildRequestFailureLog,
	evaluateSecureRequest,
	getRequestPathname
} from './node-server-request.ts';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3100;
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
const MAX_HOST_LENGTH = 253;
const HOSTNAME_LABEL_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i;

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

function isValidHostname(host: string): boolean {
	if (
		host.length === 0 ||
		host.length > MAX_HOST_LENGTH ||
		host.startsWith('.') ||
		host.endsWith('.') ||
		host.includes('..')
	) {
		return false;
	}

	return host.split('.').every((label) => HOSTNAME_LABEL_PATTERN.test(label));
}

function parseHost(hostValue: string | undefined): string {
	if (hostValue === undefined) {
		return DEFAULT_HOST;
	}

	const normalized = hostValue.trim();
	if (normalized === '') {
		throw new Error('HOST must be a valid IP address or hostname');
	}

	if (isIP(normalized) !== 0 || isValidHostname(normalized)) {
		return normalized;
	}

	throw new Error('HOST must be a valid IP address or hostname');
}

function formatInternalHttpOrigin(host: string, port: number): string {
	const normalizedHost = isIP(host) === 6 ? `[${host}]` : host;
	return new URL(`http://${normalizedHost}:${port}`).origin;
}

function getListeningLogMessage(env: Env, host: string, port: number): string {
	const internalOrigin = formatInternalHttpOrigin(host, port);
	const publicOrigin = getValidatedWorkosEnv(env).origin;
	if (publicOrigin === internalOrigin) {
		return `Listening on ${publicOrigin}`;
	}

	return `Listening on internal ${internalOrigin} (public ${publicOrigin})`;
}

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
	const activeSockets = new Set<Socket>();
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

export function startHubServer(
	options: StartHubServerOptions
): Promise<http.Server | null> {
	const env = options.env ?? process.env;
	let host = DEFAULT_HOST;
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
			if (env.HOST !== undefined) {
				host = env.HOST.trim();
			}
			host = parseHost(env.HOST);
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
