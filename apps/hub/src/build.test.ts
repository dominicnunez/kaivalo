import { describe, it } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const hubDir = process.cwd();
const nodeEntrypoint = path.join(hubDir, 'server.js');
const clientBuildDir = path.join(hubDir, 'build', 'client');

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
		'builds the documented node entrypoint and browser assets',
		{ timeout: 60000 },
		() => {
			runBuildWithDiagnostics();
			if (!existsSync(nodeEntrypoint)) {
				throw new Error('server.js was not generated');
			}
			if (!existsSync(clientBuildDir)) {
				throw new Error('build/client was not generated');
			}
		}
	);
});
