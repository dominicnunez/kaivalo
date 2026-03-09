import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RUNTIME_SERVER_FILES } from '../../apps/hub/scripts/runtime-server-files.ts';
import { getHubBuildEnv } from '../../apps/hub/scripts/build-env.ts';
import { clearNewestMtimeCache, getNewestMtimeMs } from './build-freshness.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');
const HUB_DIR = join(ROOT, 'apps', 'hub');
const BUILD_DIR = join(HUB_DIR, 'build');
const BUILD_ENTRY = join(BUILD_DIR, 'index.js');

export function getHubBuildInputPaths() {
	return [
		join(ROOT, 'package.json'),
		join(ROOT, 'package-lock.json'),
		join(ROOT, 'packages', 'ui'),
		join(HUB_DIR, 'src'),
		join(HUB_DIR, 'scripts'),
		join(HUB_DIR, 'static'),
		join(HUB_DIR, 'package.json'),
		join(HUB_DIR, 'svelte.config.js'),
		join(HUB_DIR, 'tsconfig.json'),
		join(HUB_DIR, 'vite.config.ts')
	];
}

export function getHubRuntimeServerBuildPaths() {
	return RUNTIME_SERVER_FILES.map((fileName) =>
		join(HUB_DIR, 'build', 'runtime', 'server', fileName)
	);
}

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
		...getHubBuildInputPaths().map((entryPath) => getNewestMtimeMs(entryPath))
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
		env: getHubBuildEnv({
			...process.env,
			NODE_ENV: 'test'
		})
	});

	shouldBuildCache = false;
}
