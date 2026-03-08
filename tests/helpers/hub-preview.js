import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ensureHubBuild } from './hub-build.js';
import { reserveLocalPort } from './network.js';

const REQUEST_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const PREVIEW_STARTUP_TIMEOUT_MS = 30000;
const PREVIEW_HEALTH_RETRY_DELAY_MS = 300;
const PREVIEW_PORT_RETRY_COUNT = 5;
const PREVIEW_SHUTDOWN_TIMEOUT_MS = 5000;
const PREVIEW_FORCE_KILL_TIMEOUT_MS = 2000;

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {number} previewPort
 */
function createPreviewEnv(previewPort) {
	const origin = `http://127.0.0.1:${previewPort}`;
	return {
		NODE_ENV: 'test',
		WORKOS_CLIENT_ID: 'client_test_fixture',
		WORKOS_API_KEY: 'sk_test_fixture',
		WORKOS_REDIRECT_URI: `${origin}/auth/callback`,
		WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
		ORIGIN: origin,
		HOST: '127.0.0.1',
		PORT: String(previewPort)
	};
}

export function httpGet(url, headers = {}) {
	return new Promise((resolve, reject) => {
		const client = url.startsWith('https://') ? https : http;
		const req = client.get(url, { headers }, (res) => {
			const chunks = [];
			let totalBytes = 0;
			res.on('data', (chunk) => {
				const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
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
				const body = Buffer.concat(chunks);
				resolve({
					statusCode: res.statusCode,
					data: decodeTextBody(body, res.headers['content-type']),
					body,
					headers: res.headers
				});
			});
		});

		req.on('error', reject);
		req.setTimeout(REQUEST_TIMEOUT_MS, () => {
			req.destroy(new Error('Request timeout'));
		});
	});
}

function decodeTextBody(body, contentTypeHeader) {
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

export async function startHubPreview() {
	return acquireSharedHubPreview();
}

let sharedPreviewPromise = null;
let sharedPreview = null;
let activeLeases = 0;
let cleanupRegistered = false;
let shutdownTimer = null;
const SHARED_PREVIEW_IDLE_SHUTDOWN_MS = 15000;

async function acquireSharedHubPreview(retryOnStale = true) {
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

	let preview;
	try {
		preview = await sharedPreviewPromise;
	} catch (error) {
		activeLeases = Math.max(0, activeLeases - 1);
		throw error;
	}

	try {
		const health = await httpGet(preview.baseUrl);
		if (health.statusCode !== 200) {
			throw new Error(`unexpected status ${health.statusCode}`);
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

async function createHubPreview() {
	ensureHubBuild();

	const hubDir = path.join(
		path.resolve(import.meta.dirname, '..', '..'),
		'apps/hub'
	);
	let lastError = null;

	for (let attempt = 0; attempt < PREVIEW_PORT_RETRY_COUNT; attempt += 1) {
		const reservedPort = await reserveLocalPort();

		try {
			return await startPreviewProcess(
				hubDir,
				reservedPort.port,
				reservedPort.release
			);
		} catch (error) {
			lastError = error;

			// Only retry on startup failures likely related to port binding.
			if (
				!/address already in use|EADDRINUSE/i.test(String(error?.message ?? ''))
			) {
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
	hubDir,
	previewPort,
	releasePortReservation
) {
	const baseUrl = `http://127.0.0.1:${previewPort}`;
	const output = [];
	const appendOutput = (chunk) => {
		if (!chunk) {
			return;
		}
		output.push(chunk.toString());
		if (output.length > 60) {
			output.shift();
		}
	};

	const server = spawn('node', ['server.js'], {
		cwd: hubDir,
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: true,
		env: {
			...process.env,
			...createPreviewEnv(previewPort)
		}
	});
	server.stdout?.on('data', appendOutput);
	server.stderr?.on('data', appendOutput);

	let stopped = false;
	let exitSignal = null;
	let exitCode = null;
	let spawnError = null;
	let didExit = false;
	let resolveExit;
	const exitPromise = new Promise((resolve) => {
		resolveExit = resolve;
	});

	server.once('exit', (code, signal) => {
		exitCode = code;
		exitSignal = signal;
		didExit = true;
		resolveExit({ code, signal });
	});
	server.once('error', (error) => {
		spawnError = error;
	});

	await releasePortReservation();

	const waitForExit = async (timeoutMs) => {
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

		try {
			process.kill(-server.pid, 'SIGTERM');
		} catch (error) {
			if (error.code !== 'ESRCH') {
				throw error;
			}
			return;
		}

		if (await waitForExit(PREVIEW_SHUTDOWN_TIMEOUT_MS)) {
			return;
		}

		try {
			process.kill(-server.pid, 'SIGKILL');
		} catch (error) {
			if (error.code !== 'ESRCH') {
				throw error;
			}
			return;
		}

		await waitForExit(PREVIEW_FORCE_KILL_TIMEOUT_MS);
	};

	const startupDeadline = Date.now() + PREVIEW_STARTUP_TIMEOUT_MS;
	while (Date.now() < startupDeadline) {
		if (spawnError) {
			await stopServer();
			throw new Error(
				`Unable to start hub preview server: ${spawnError.message}`
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
			const response = await httpGet(baseUrl);
			if (response.statusCode === 200) {
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
