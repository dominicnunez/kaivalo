import { describe, it } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const hubDir = process.cwd();
const buildEntry = path.join(hubDir, 'build', 'index.js');
const buildHandler = path.join(hubDir, 'build', 'handler.js');
const buildServer = path.join(hubDir, 'build', 'server', 'index.js');

type ExecErrorWithOutput = Error & {
	stdout?: string | Buffer;
	stderr?: string | Buffer;
};

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

describe('Production build', () => {
	it(
		'builds loadable adapter output for the production server',
		{ timeout: 60000 },
		async () => {
			runBuildWithDiagnostics();
			if (!existsSync(buildEntry)) {
				throw new Error('build/index.js was not generated');
			}
			if (!existsSync(buildHandler)) {
				throw new Error('build/handler.js was not generated');
			}
			if (!existsSync(buildServer)) {
				throw new Error('build/server/index.js was not generated');
			}

			const handlerModule = await import(
				`${pathToFileURL(buildHandler).href}?t=${Date.now()}`
			);
			if (typeof handlerModule.handler !== 'function') {
				throw new Error('build/handler.js did not export a request handler');
			}

			const serverModule = await import(
				`${pathToFileURL(buildServer).href}?t=${Date.now()}`
			);
			if (typeof serverModule.Server !== 'function') {
				throw new Error(
					'build/server/index.js did not export the server entry'
				);
			}
		}
	);
});
