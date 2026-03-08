import { describe, expect, it } from 'vitest';
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';

const hubDir = process.cwd();
const nodeEntrypoint = path.join(hubDir, 'server.ts');
const STARTUP_TIMEOUT_MS = 10_000;
const PROCESS_EXIT_TIMEOUT_MS = 5_000;

type ExecErrorWithOutput = Error & {
	stdout?: string | Buffer;
	stderr?: string | Buffer;
};

function reserveLocalPort(host = '127.0.0.1') {
	return new Promise<{ port: number; release: () => Promise<void> }>(
		(resolve, reject) => {
			const reservation = net.createServer();
			let released = false;
			const release = () =>
				new Promise<void>((releaseResolve, releaseReject) => {
					if (released) {
						releaseResolve();
						return;
					}
					released = true;
					reservation.close((error) => {
						if (error) {
							releaseReject(error);
							return;
						}
						releaseResolve();
					});
				});

			reservation.unref();
			reservation.once('error', reject);
			reservation.listen(0, host, () => {
				const address = reservation.address();
				if (!address || typeof address === 'string') {
					void release().finally(() =>
						reject(new Error('Unable to reserve local TCP port'))
					);
					return;
				}
				resolve({ port: address.port, release });
			});
		}
	);
}

function runBuildWithDiagnostics() {
	try {
		execSync('npm run build', {
			cwd: hubDir,
			stdio: 'pipe',
			encoding: 'utf8',
			maxBuffer: 10 * 1024 * 1024,
			env: {
				...process.env,
				WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID ?? 'client_test_fixture',
				WORKOS_API_KEY: process.env.WORKOS_API_KEY ?? 'sk_test_fixture',
				WORKOS_REDIRECT_URI:
					process.env.WORKOS_REDIRECT_URI ??
					'http://localhost:3100/auth/callback',
				WORKOS_COOKIE_PASSWORD:
					process.env.WORKOS_COOKIE_PASSWORD ?? 'ab'.repeat(32),
				ORIGIN: process.env.ORIGIN ?? 'http://localhost:3100'
			}
		});
	} catch (error) {
		const execError = error as ExecErrorWithOutput;
		const stdout =
			typeof execError.stdout === 'string' ? execError.stdout.trim() : '';
		const stderr =
			typeof execError.stderr === 'string' ? execError.stderr.trim() : '';
		const diagnostics = [stdout, stderr].filter(Boolean).join('\n\n');
		throw new Error(
			diagnostics
				? `npm run build failed\n\n${diagnostics}`
				: `npm run build failed: ${error instanceof Error ? error.message : String(error)}`,
			{
				cause: error
			}
		);
	}
}

function httpGet(url: string): Promise<{ statusCode: number; data: string }> {
	return new Promise((resolve, reject) => {
		const req = http.get(url, (response) => {
			const chunks: Buffer[] = [];
			response.on('data', (chunk) => {
				chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
			});
			response.on('end', () => {
				resolve({
					statusCode: response.statusCode ?? 0,
					data: Buffer.concat(chunks).toString('utf8')
				});
			});
		});
		req.on('error', reject);
		req.setTimeout(5_000, () => req.destroy(new Error('request timeout')));
	});
}

function stopProcessGroup(server: ReturnType<typeof spawn>) {
	return new Promise<void>((resolve) => {
		const timeout = setTimeout(() => {
			try {
				process.kill(-server.pid!, 'SIGKILL');
			} catch {
				// Ignore already-stopped processes.
			}
			resolve();
		}, PROCESS_EXIT_TIMEOUT_MS);
		timeout.unref();

		server.once('exit', () => {
			clearTimeout(timeout);
			resolve();
		});

		try {
			process.kill(-server.pid!, 'SIGTERM');
		} catch {
			clearTimeout(timeout);
			resolve();
		}
	});
}

async function startBuiltServer() {
	const reservation = await reserveLocalPort();
	const port = reservation.port;
	await reservation.release();

	const server = spawn('node', [nodeEntrypoint], {
		cwd: hubDir,
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: true,
		env: {
			...process.env,
			NODE_ENV: 'test',
			PORT: String(port),
			HOST: '127.0.0.1',
			WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID ?? 'client_test_fixture',
			WORKOS_API_KEY: process.env.WORKOS_API_KEY ?? 'sk_test_fixture',
			WORKOS_REDIRECT_URI:
				process.env.WORKOS_REDIRECT_URI ??
				`http://127.0.0.1:${port}/auth/callback`,
			WORKOS_COOKIE_PASSWORD:
				process.env.WORKOS_COOKIE_PASSWORD ?? 'ab'.repeat(32),
			ORIGIN: process.env.ORIGIN ?? `http://127.0.0.1:${port}`
		}
	});

	const baseUrl = `http://127.0.0.1:${port}`;
	const startupDeadline = Date.now() + STARTUP_TIMEOUT_MS;
	while (Date.now() < startupDeadline) {
		try {
			const health = await httpGet(new URL('/healthz', baseUrl).toString());
			if (health.statusCode === 200 && health.data.trim() === 'ok') {
				return { server, baseUrl };
			}
		} catch {
			// Retry until the server is ready or times out.
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}

	await stopProcessGroup(server);
	throw new Error('Built server did not become ready before timeout');
}

describe('Production build', () => {
	it(
		'builds a deployable server that starts and serves requests',
		{ timeout: 60000 },
		async () => {
			runBuildWithDiagnostics();
			const { server, baseUrl } = await startBuiltServer();

			try {
				const health = await httpGet(new URL('/healthz', baseUrl).toString());
				const landingPage = await httpGet(baseUrl);
				expect(health).toEqual({
					statusCode: 200,
					data: 'ok'
				});
				expect(landingPage.statusCode).toBe(200);
				expect(landingPage.data).toContain('<!doctype html>');
			} finally {
				await stopProcessGroup(server);
			}
		}
	);
});
