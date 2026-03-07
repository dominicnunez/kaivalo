import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { clearNewestMtimeCache, getNewestMtimeMs } from './build-freshness.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const HUB_DIR = join(ROOT, 'apps', 'hub');
const BUILD_DIR = join(HUB_DIR, 'build');
const BUILD_ENTRY = join(BUILD_DIR, 'index.js');
const BUILD_INPUT_PATHS = [
	join(ROOT, 'package.json'),
	join(ROOT, 'package-lock.json'),
	join(HUB_DIR, 'src'),
	join(HUB_DIR, 'static'),
	join(HUB_DIR, 'package.json'),
	join(HUB_DIR, 'svelte.config.js'),
	join(HUB_DIR, 'tsconfig.json'),
	join(HUB_DIR, 'vite.config.ts')
];

let didCheckBuild = false;
let shouldBuildCache = false;

function shouldRebuildOncePerProcess() {
	if (didCheckBuild) {
		return shouldBuildCache;
	}

	didCheckBuild = true;

	if (!existsSync(BUILD_DIR) || !existsSync(BUILD_ENTRY)) {
		shouldBuildCache = true;
		return shouldBuildCache;
	}

	clearNewestMtimeCache();
	const buildTimeMs = statSync(BUILD_ENTRY).mtimeMs;
	const newestInputTimeMs = Math.max(
		...BUILD_INPUT_PATHS.map((entryPath) => getNewestMtimeMs(entryPath))
	);
	shouldBuildCache = newestInputTimeMs > buildTimeMs;
	return shouldBuildCache;
}

export function ensureHubBuild() {
	if (!shouldRebuildOncePerProcess()) {
		return;
	}

	execSync('npm run build 2>&1', {
		cwd: HUB_DIR,
		timeout: 180000,
		encoding: 'utf8',
		env: {
			...process.env,
			NODE_ENV: 'test',
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

	shouldBuildCache = false;
}
