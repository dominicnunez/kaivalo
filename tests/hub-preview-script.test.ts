import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ensureHubBuild } from './helpers/hub-build.ts';
import { httpGet } from './helpers/hub-preview.ts';
import { reserveLocalPort } from './helpers/network.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const STARTUP_TIMEOUT_MS = 15000;
const STARTUP_DELAY_MS = 250;
const PROCESS_EXIT_TIMEOUT_MS = 5000;
const MAX_STARTUP_OUTPUT_LINES = 120;
type ProcessShutdownResult = {
	forced: boolean;
};
const PREVIEW_ENV_NAMES = [
	'WORKOS_CLIENT_ID',
	'WORKOS_API_KEY',
	'WORKOS_REDIRECT_URI',
	'WORKOS_COOKIE_PASSWORD',
	'AUTH_ERROR_SIGNING_SECRET',
	'ORIGIN'
];

function createPreviewScriptEnv(port: number): NodeJS.ProcessEnv {
	const env = {
		...process.env,
		HOST: '127.0.0.1',
		PORT: String(port),
		NODE_ENV: 'production'
	};

	for (const envName of PREVIEW_ENV_NAMES) {
		delete env[envName];
	}

	return env;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopProcessGroup(
	server: import('node:child_process').ChildProcess
): Promise<ProcessShutdownResult> {
	return new Promise((resolve) => {
		let forced = false;
		const timeout = setTimeout(() => {
			try {
				forced = true;
				process.kill(-server.pid!, 'SIGKILL');
			} catch {
				// Ignore already-stopped process.
			}
			resolve({ forced });
		}, PROCESS_EXIT_TIMEOUT_MS);
		timeout.unref();

		server.once('exit', () => {
			clearTimeout(timeout);
			resolve({ forced });
		});

		try {
			process.kill(-server.pid!, 'SIGTERM');
		} catch {
			clearTimeout(timeout);
			resolve({ forced: false });
		}
	});
}

describe('hub preview script', () => {
	it('starts the built node runtime without requiring local auth secrets', async () => {
		ensureHubBuild();

		const reservation = await reserveLocalPort();
		const port = reservation.port;
		const baseUrl = `http://127.0.0.1:${port}`;
		const output: string[] = [];
		const appendOutput = (chunk: Buffer | string) => {
			const text = chunk.toString();
			for (const line of text.split(/\r?\n/)) {
				if (!line) {
					continue;
				}

				output.push(line);
				if (output.length > MAX_STARTUP_OUTPUT_LINES) {
					output.shift();
				}
			}
		};

		const preview = spawn('npm', ['--prefix', 'apps/hub', 'run', 'preview'], {
			cwd: ROOT,
			stdio: ['ignore', 'pipe', 'pipe'],
			detached: true,
			env: createPreviewScriptEnv(port)
		});
		preview.stdout?.on('data', appendOutput);
		preview.stderr?.on('data', appendOutput);

		await reservation.release();

		let exitCode: number | null = null;
		let exitSignal: NodeJS.Signals | null = null;
		let spawnError: Error | null = null;
		preview.once('error', (error) => {
			spawnError = error;
		});
		preview.once('exit', (code, signal) => {
			exitCode = code;
			exitSignal = signal;
		});

		try {
			const deadline = Date.now() + STARTUP_TIMEOUT_MS;
			while (Date.now() < deadline) {
				if (spawnError) {
					throw spawnError;
				}

				if (exitCode !== null || exitSignal !== null) {
					throw new Error(
						`preview exited before readiness: ${output.join('\n')}`
					);
				}

				try {
					const response = await httpGet(`${baseUrl}/healthz`);
					if (response.statusCode === 200 && response.data.trim() === 'ok') {
						const homepage = await httpGet(baseUrl);
						assert.strictEqual(homepage.statusCode, 200);
						assert.match(homepage.data, /Kaivalo/i);
						return;
					}
				} catch {
					// Keep polling until startup completes.
				}

				await delay(STARTUP_DELAY_MS);
			}

			throw new Error(
				`preview did not become ready within ${STARTUP_TIMEOUT_MS}ms:\n${output.join('\n')}`
			);
		} finally {
			const shutdown = await stopProcessGroup(preview);
			assert.equal(
				shutdown.forced,
				false,
				'expected preview shutdown to exit without requiring SIGKILL fallback'
			);
		}
	});
});
