import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
	RUNTIME_SERVER_FILES,
	RUNTIME_SHARED_FILES
} from '../../scripts/runtime-server-files.ts';
import { getHubBuildEnv } from '../../scripts/build-env.ts';
import { clearNewestMtimeCache, getNewestMtimeMs } from './build-freshness.ts';
import { sanitizeHubRuntimeEnv } from './hub-runtime-env.ts';

const HUB_DIR = resolve(import.meta.dirname, '..', '..');
const ROOT = resolve(HUB_DIR, '..', '..');
const BUILD_DIR = join(HUB_DIR, 'build');
const BUILD_ENTRY = join(BUILD_DIR, 'index.js');

type BuildFreshnessOptions = {
	buildDir: string;
	buildEntry: string;
	inputPaths: string[];
};

type EnsureBuildFreshOptions = BuildFreshnessOptions & {
	runBuild: () => void;
};

export function getHubBuildInputPaths() {
	return [
		join(ROOT, 'package.json'),
		join(ROOT, 'pnpm-lock.yaml'),
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
	return [
		...RUNTIME_SERVER_FILES.map((fileName) =>
			join(HUB_DIR, 'build', 'runtime', 'server', fileName)
		),
		...RUNTIME_SHARED_FILES.map((fileName) =>
			join(HUB_DIR, 'build', 'runtime', fileName)
		)
	];
}

export function shouldBuildBeRegenerated({
	buildDir,
	buildEntry,
	inputPaths
}: BuildFreshnessOptions) {
	if (!existsSync(buildDir) || !existsSync(buildEntry)) {
		return true;
	}

	clearNewestMtimeCache();
	const buildTimeMs = statSync(buildEntry).mtimeMs;
	const newestInputTimeMs = Math.max(
		...inputPaths.map((entryPath) => getNewestMtimeMs(entryPath))
	);
	return newestInputTimeMs > buildTimeMs;
}

export function ensureHubBuild() {
	return ensureBuildFresh({
		buildDir: BUILD_DIR,
		buildEntry: BUILD_ENTRY,
		inputPaths: getHubBuildInputPaths(),
		runBuild: () =>
			execSync('pnpm run build 2>&1', {
				cwd: HUB_DIR,
				timeout: 180000,
				encoding: 'utf8',
				env: getHubBuildEnv({
					...sanitizeHubRuntimeEnv(process.env),
					NODE_ENV: 'test'
				})
			})
	});
}

export function assertHubBuildAvailable() {
	if (
		shouldBuildBeRegenerated({
			buildDir: BUILD_DIR,
			buildEntry: BUILD_ENTRY,
			inputPaths: getHubBuildInputPaths()
		})
	) {
		throw new Error(
			'Hub preview tests require an up-to-date build. Run `pnpm run test:build:hub` first.'
		);
	}
}

export function ensureBuildFresh({
	buildDir,
	buildEntry,
	inputPaths,
	runBuild
}: EnsureBuildFreshOptions) {
	if (
		!shouldBuildBeRegenerated({
			buildDir,
			buildEntry,
			inputPaths
		})
	) {
		return false;
	}

	runBuild();
	return true;
}
