import { describe, it } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { getNewestMtimeMs } from '../../../tests/helpers/build-freshness.js';

const RUN_BUILD_TESTS = process.env.RUN_BUILD_TESTS === '1';
const hubDir = process.cwd();
const buildEntry = path.join(hubDir, 'build', 'index.js');
const srcDir = path.join(hubDir, 'src');
const staticDir = path.join(hubDir, 'static');
const appHtml = path.join(hubDir, 'src', 'app.html');
const svelteConfig = path.join(hubDir, 'svelte.config.js');
const viteConfig = path.join(hubDir, 'vite.config.ts');
const tsConfig = path.join(hubDir, 'tsconfig.json');
const packageJson = path.join(hubDir, 'package.json');
const buildInputs = [srcDir, staticDir, appHtml, svelteConfig, viteConfig, tsConfig, packageJson];

describe('Production build', () => {
	const buildCheck = RUN_BUILD_TESTS ? it : it.skip;

	buildCheck('should build successfully with zero errors', { timeout: 60000 }, () => {
		execSync('npm run build', {
			cwd: hubDir,
			stdio: 'ignore',
			env: {
				...process.env,
				WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID ?? 'client_test_fixture',
				WORKOS_API_KEY: process.env.WORKOS_API_KEY ?? 'sk_test_fixture',
				WORKOS_REDIRECT_URI: process.env.WORKOS_REDIRECT_URI ?? 'http://localhost:3100/auth/callback',
				WORKOS_COOKIE_PASSWORD: process.env.WORKOS_COOKIE_PASSWORD ?? 'ab'.repeat(32),
				ORIGIN: process.env.ORIGIN ?? 'http://localhost:3100'
			}
		});
		if (!existsSync(buildEntry)) {
			throw new Error('build/index.js was not generated');
		}

		const buildMtime = statSync(buildEntry).mtimeMs;
		const newestInputMtime = Math.max(...buildInputs.map((entry) => getNewestMtimeMs(entry)));
		if (buildMtime < newestInputMtime) {
			throw new Error('build output is older than source inputs');
		}
	});
});
