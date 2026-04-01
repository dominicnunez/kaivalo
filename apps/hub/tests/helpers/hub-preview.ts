import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CookieJar } from 'tough-cookie';
import { ensureHubBuild } from './hub-build.ts';
import {
	getHubHealthResponseViolations,
	getHubHealthUrl,
	isHubHealthResponse
} from './hub-health.ts';
import { reserveLocalPort } from '../../../../tests/helpers/network.ts';
import { createHubPreviewEnv } from './hub-runtime-env.ts';

const REQUEST_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const PREVIEW_STARTUP_TIMEOUT_MS = 30000;
const PREVIEW_HEALTH_RETRY_DELAY_MS = 300;
const PREVIEW_PORT_RETRY_COUNT = 5;
const PREVIEW_SHUTDOWN_TIMEOUT_MS = 5000;
const PREVIEW_FORCE_KILL_TIMEOUT_MS = 2000;

type RequestHeaders = Record<string, string>;
type SameSiteContext = 'strict' | 'lax' | 'none';
type HttpRequestOptions = {
	headers?: RequestHeaders;
	cookieJar?: CookieJar;
	sameSiteContext?: SameSiteContext;
};
type HubPreviewOptions = {
	env?: Record<string, string | undefined>;
	imports?: string[];
	shared?: boolean;
};
export type HubPreviewHandle = {
	baseUrl: string;
	stop: () => Promise<void>;
};
type ReservedPort = {
	port: number;
	release: () => Promise<void>;
};
type PreviewExitResult = {
	code: number | null;
	signal: NodeJS.Signals | null;
};

export type PreviewHttpResponse = {
	statusCode: number | undefined;
	data: string;
	body: Buffer;
	headers: http.IncomingHttpHeaders;
};

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPreviewEnv(
	previewPort: number,
	envOverrides: Record<string, string | undefined> = {},
	imports: string[] = []
): NodeJS.ProcessEnv {
	return createHubPreviewEnv({
		port: previewPort,
		envOverrides,
		imports
	});
}

function shouldUseSharedPreview(options: HubPreviewOptions = {}): boolean {
	const hasCustomEnv = Object.keys(options.env ?? {}).length > 0;
	const hasCustomImports = (options.imports?.length ?? 0) > 0;
	return options.shared !== false && !hasCustomEnv && !hasCustomImports;
}

function isHttpRequestOptions(
	headersOrOptions: RequestHeaders | HttpRequestOptions
): headersOrOptions is HttpRequestOptions {
	return (
		'cookieJar' in headersOrOptions ||
		'sameSiteContext' in headersOrOptions ||
		('headers' in headersOrOptions &&
			typeof headersOrOptions.headers === 'object' &&
			headersOrOptions.headers !== null)
	);
}

function normalizeRequestOptions(
	headersOrOptions: RequestHeaders | HttpRequestOptions = {}
): HttpRequestOptions {
	if (isHttpRequestOptions(headersOrOptions)) {
		return headersOrOptions;
	}

	return {
		headers: headersOrOptions
	};
}

function getSetCookieHeaders(headers: http.IncomingHttpHeaders): string[] {
	const values = headers['set-cookie'];
	if (!values) {
		return [];
	}

	return Array.isArray(values) ? values : [values];
}

async function buildRequestHeaders(
	url: string,
	{ headers = {}, cookieJar, sameSiteContext = 'strict' }: HttpRequestOptions
): Promise<RequestHeaders> {
	if (!cookieJar) {
		return { ...headers };
	}

	const cookieHeader = await cookieJar.getCookieString(url, {
		sameSiteContext
	});
	if (!cookieHeader) {
		return { ...headers };
	}

	return {
		...headers,
		cookie: headers.cookie ? `${headers.cookie}; ${cookieHeader}` : cookieHeader
	};
}

async function storeResponseCookies(
	url: string,
	headers: http.IncomingHttpHeaders,
	cookieJar: CookieJar | undefined
): Promise<void> {
	if (!cookieJar) {
		return;
	}

	for (const setCookieHeader of getSetCookieHeaders(headers)) {
		await cookieJar.setCookie(setCookieHeader, url);
	}
}

export function createBrowserCookieJar(): CookieJar {
	return new CookieJar(undefined, {
		prefixSecurity: 'strict'
	});
}

export function httpRequest(
	url: string,
	method: string,
	requestOptions: HttpRequestOptions = {}
): Promise<PreviewHttpResponse> {
	return new Promise((resolve, reject) => {
		void (async () => {
			const client = url.startsWith('https://') ? https : http;
			const headers = await buildRequestHeaders(url, requestOptions);
			const req = client.request(
				url,
				{
					method,
					headers
				},
				(res) => {
					const chunks: Buffer[] = [];
					let totalBytes = 0;
					res.on('data', (chunk) => {
						const chunkBuffer = Buffer.isBuffer(chunk)
							? chunk
							: Buffer.from(chunk);
						totalBytes += chunkBuffer.length;
						if (totalBytes > MAX_RESPONSE_BYTES) {
							res.destroy(
								new Error(`Response exceeded ${MAX_RESPONSE_BYTES} bytes`)
							);
							return;
						}
						chunks.push(chunkBuffer);
					});
					res.on('end', () => {
						void (async () => {
							try {
								const body = Buffer.concat(chunks);
								await storeResponseCookies(
									url,
									res.headers,
									requestOptions.cookieJar
								);
								resolve({
									statusCode: res.statusCode,
									data: decodeTextBody(body, res.headers['content-type']),
									body,
									headers: res.headers
								});
							} catch (error) {
								reject(error);
							}
						})();
					});
				}
			);

			req.on('error', reject);
			req.setTimeout(REQUEST_TIMEOUT_MS, () => {
				req.destroy(new Error('Request timeout'));
			});
			req.end();
		})().catch(reject);
	});
}

export function httpGet(
	url: string,
	headersOrOptions: RequestHeaders | HttpRequestOptions = {}
): Promise<PreviewHttpResponse> {
	return httpRequest(url, 'GET', normalizeRequestOptions(headersOrOptions));
}

export function httpPost(
	url: string,
	headersOrOptions: RequestHeaders | HttpRequestOptions = {}
): Promise<PreviewHttpResponse> {
	return httpRequest(url, 'POST', normalizeRequestOptions(headersOrOptions));
}

function decodeTextBody(
	body: Buffer,
	contentTypeHeader: string | string[] | undefined
): string {
	const contentType = String(contentTypeHeader ?? '').toLowerCase();
	const isTextResponse =
		contentType.startsWith('text/') ||
		contentType.includes('application/json') ||
		contentType.includes('application/javascript') ||
		contentType.includes('application/xml') ||
		contentType.includes('application/xhtml+xml') ||
		contentType.includes('image/svg+xml');

	if (!isTextResponse) {
		return '';
	}

	return body.toString('utf8');
}

export async function startHubPreview(
	options: HubPreviewOptions = {}
): Promise<HubPreviewHandle> {
	if (!shouldUseSharedPreview(options)) {
		return createHubPreview(options);
	}

	return acquireSharedHubPreview();
}

let sharedPreviewPromise: Promise<HubPreviewHandle> | null = null;
let sharedPreview: HubPreviewHandle | null = null;
let activeLeases = 0;
let cleanupRegistered = false;
let shutdownTimer: NodeJS.Timeout | null = null;
const SHARED_PREVIEW_IDLE_SHUTDOWN_MS = 15000;

async function acquireSharedHubPreview(
	retryOnStale = true
): Promise<HubPreviewHandle> {
	if (!sharedPreviewPromise) {
		sharedPreviewPromise = createHubPreview()
			.then((preview) => {
				sharedPreview = preview;
				return preview;
			})
			.catch((error) => {
				sharedPreviewPromise = null;
				throw error;
			});
	}

	if (shutdownTimer) {
		clearTimeout(shutdownTimer);
		shutdownTimer = null;
	}
	activeLeases += 1;

	let preview: HubPreviewHandle;
	try {
		preview = await sharedPreviewPromise;
	} catch (error) {
		activeLeases = Math.max(0, activeLeases - 1);
		throw error;
	}

	try {
		const health = await httpGet(getHubHealthUrl(preview.baseUrl));
		const healthViolations = getHubHealthResponseViolations(health);
		if (healthViolations.length > 0) {
			throw new Error(healthViolations.join('; '));
		}
	} catch (error) {
		activeLeases = Math.max(0, activeLeases - 1);
		if (!retryOnStale) {
			throw error;
		}

		try {
			await sharedPreview?.stop();
		} catch {
			// ignore stale cleanup failures
		}
		sharedPreview = null;
		sharedPreviewPromise = null;
		return acquireSharedHubPreview(false);
	}

	if (!cleanupRegistered) {
		cleanupRegistered = true;
		process.once('exit', () => {
			void sharedPreview?.stop();
		});
	}

	let stopped = false;
	return {
		baseUrl: preview.baseUrl,
		stop: async () => {
			if (stopped) {
				return;
			}
			stopped = true;
			activeLeases = Math.max(0, activeLeases - 1);
			if (activeLeases === 0 && !shutdownTimer) {
				shutdownTimer = setTimeout(() => {
					shutdownTimer = null;
					if (activeLeases !== 0 || !sharedPreview) {
						return;
					}
					void sharedPreview.stop();
					sharedPreview = null;
					sharedPreviewPromise = null;
				}, SHARED_PREVIEW_IDLE_SHUTDOWN_MS);
				shutdownTimer.unref();
			}
		}
	};
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error;
}

async function createHubPreview(
	options: HubPreviewOptions = {}
): Promise<HubPreviewHandle> {
	ensureHubBuild();

	const hubDir = path.resolve(import.meta.dirname, '..', '..');
	let lastError: unknown = null;

	for (let attempt = 0; attempt < PREVIEW_PORT_RETRY_COUNT; attempt += 1) {
		const reservedPort = (await reserveLocalPort()) as ReservedPort;

		try {
			return await startPreviewProcess(
				hubDir,
				reservedPort.port,
				reservedPort.release,
				options
			);
		} catch (error) {
			lastError = error;

			// Only retry on startup failures likely related to port binding.
			if (!/address already in use|EADDRINUSE/i.test(getErrorMessage(error))) {
				throw error;
			}
		}
	}

	throw (
		lastError ??
		new Error('Unable to start hub preview server after retrying ports')
	);
}

async function startPreviewProcess(
	hubDir: string,
	previewPort: number,
	releasePortReservation: ReservedPort['release'],
	options: HubPreviewOptions = {}
): Promise<HubPreviewHandle> {
	const baseUrl = `http://127.0.0.1:${previewPort}`;
	const output: string[] = [];
	const appendOutput = (chunk: Buffer | string | null | undefined): void => {
		if (!chunk) {
			return;
		}
		output.push(chunk.toString());
		if (output.length > 60) {
			output.shift();
		}
	};

	const server = spawn('node', ['server.ts'], {
		cwd: hubDir,
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: true,
		env: createPreviewEnv(previewPort, options.env, options.imports)
	});
	server.stdout?.on('data', appendOutput);
	server.stderr?.on('data', appendOutput);

	let stopped = false;
	let exitSignal: NodeJS.Signals | null = null;
	let exitCode: number | null = null;
	let spawnError: Error | null = null;
	let didExit = false;
	let resolveExit: ((result: PreviewExitResult) => void) | null = null;
	const exitPromise = new Promise<PreviewExitResult>((resolve) => {
		resolveExit = resolve;
	});

	server.once('exit', (code, signal) => {
		exitCode = code;
		exitSignal = signal;
		didExit = true;
		resolveExit?.({ code, signal });
	});
	server.once('error', (error) => {
		spawnError = error;
	});

	await releasePortReservation();

	const waitForExit = async (timeoutMs: number): Promise<boolean> => {
		if (didExit) {
			return true;
		}
		const exitedInTime = await Promise.race([
			exitPromise.then(() => true),
			delay(timeoutMs).then(() => false)
		]);
		return exitedInTime;
	};

	const stopServer = async () => {
		if (stopped) {
			return;
		}
		stopped = true;

		if (didExit) {
			return;
		}

		const processGroupId = server.pid;
		if (typeof processGroupId !== 'number') {
			return;
		}

		try {
			process.kill(-processGroupId, 'SIGTERM');
		} catch (error) {
			if (!isErrnoException(error) || error.code !== 'ESRCH') {
				throw error;
			}
			return;
		}

		if (await waitForExit(PREVIEW_SHUTDOWN_TIMEOUT_MS)) {
			return;
		}

		try {
			process.kill(-processGroupId, 'SIGKILL');
		} catch (error) {
			if (!isErrnoException(error) || error.code !== 'ESRCH') {
				throw error;
			}
			return;
		}

		await waitForExit(PREVIEW_FORCE_KILL_TIMEOUT_MS);
	};

	const startupDeadline = Date.now() + PREVIEW_STARTUP_TIMEOUT_MS;
	while (Date.now() < startupDeadline) {
		const currentSpawnError = spawnError;
		if (currentSpawnError) {
			await stopServer();
			throw new Error(
				`Unable to start hub preview server: ${getErrorMessage(currentSpawnError)}`
			);
		}

		if (exitCode !== null || exitSignal !== null) {
			const reason = exitSignal ? `signal ${exitSignal}` : `code ${exitCode}`;
			const diagnostics = output.join('').trim();
			throw new Error(
				`Unable to start hub preview server: process exited with ${reason}${
					diagnostics ? `\n\nPreview output:\n${diagnostics}` : ''
				}`
			);
		}

		try {
			const response = await httpGet(getHubHealthUrl(baseUrl));
			if (isHubHealthResponse(response)) {
				return {
					baseUrl,
					stop: stopServer
				};
			}
		} catch {
			// Keep waiting for preview startup.
		}

		await delay(PREVIEW_HEALTH_RETRY_DELAY_MS);
	}

	await stopServer();
	await releasePortReservation();
	const diagnostics = output.join('').trim();
	throw new Error(
		`Unable to start hub preview server: timed out after ${PREVIEW_STARTUP_TIMEOUT_MS}ms${
			diagnostics ? `\n\nPreview output:\n${diagnostics}` : ''
		}`
	);
}
