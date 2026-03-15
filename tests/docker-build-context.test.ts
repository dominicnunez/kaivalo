import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOCKERIGNORE_PATH = path.join(ROOT, '.dockerignore');
const REPOSITORY_DOCKERFILE_PATH = path.join(ROOT, 'Dockerfile');
const PROBE_DOCKERFILE_PATH = 'Dockerfile.probe';
const PROBE_IMAGE_TAG = `kaivalo-docker-context:${Date.now()}-${process.pid}`;
const PROBE_BASE_IMAGE =
	readFileSync(REPOSITORY_DOCKERFILE_PATH, 'utf8').match(
		/(?:^|\n)FROM\s+(\S+)/
	)?.[1] ?? 'node:24.14.0-bookworm-slim';
const tempDirectories = new Set<string>();

function hasDocker(): boolean {
	return (
		spawnSync('docker', ['--version'], {
			stdio: 'ignore'
		}).status === 0
	);
}

function createTemporaryContext(): string {
	const contextRoot = mkdtempSync(
		path.join(tmpdir(), 'kaivalo-docker-build-context-')
	);
	tempDirectories.add(contextRoot);
	return contextRoot;
}

function writeContextFile(
	contextRoot: string,
	relativePath: string,
	contents = 'probe\n'
): void {
	const targetPath = path.join(contextRoot, relativePath);
	mkdirSync(path.dirname(targetPath), { recursive: true });
	writeFileSync(targetPath, contents);
}

function removeImageTag(imageTag: string): void {
	spawnSync('docker', ['image', 'rm', '--force', imageTag], {
		cwd: ROOT,
		encoding: 'utf8',
		stdio: 'pipe'
	});
}

function runDockerBuild(cwd: string, args: readonly string[]) {
	return spawnSync('docker', ['build', ...args], {
		cwd,
		encoding: 'utf8',
		stdio: 'pipe'
	});
}

afterEach(() => {
	removeImageTag(PROBE_IMAGE_TAG);

	for (const tempDirectory of Array.from(tempDirectories)) {
		tempDirectories.delete(tempDirectory);
		rmSync(tempDirectory, {
			force: true,
			recursive: true
		});
	}
});

describe('docker build context', () => {
	it(
		'uses Docker to exclude non-runtime repository content from the build context',
		{ skip: !hasDocker() },
		() => {
			const contextRoot = createTemporaryContext();
			writeFileSync(
				path.join(contextRoot, '.dockerignore'),
				readFileSync(DOCKERIGNORE_PATH, 'utf8')
			);

			for (const excludedPath of [
				'AGENTS.md',
				'.husky/pre-push',
				'flake.nix',
				'eslint.config.js',
				'.prettierrc.json',
				'tests/docker-build-context.test.ts',
				'docs/architecture.md',
				'audit/report.md',
				'scripts/build-production-image-smoke.sh',
				'apps/hub/src/build.test.ts',
				'packages/ui/index.test.ts',
				'apps/hub/src/routes/__tests__/unexpected-error/+page.server.ts'
			]) {
				writeContextFile(contextRoot, excludedPath);
			}

			for (const includedPath of [
				'apps/hub/src/routes/+layout.server.ts',
				'package.json',
				'Dockerfile'
			]) {
				writeContextFile(contextRoot, includedPath);
			}

			writeContextFile(
				contextRoot,
				PROBE_DOCKERFILE_PATH,
				[
					`FROM ${PROBE_BASE_IMAGE}`,
					'WORKDIR /context',
					'COPY . /context',
					'RUN test ! -e /context/AGENTS.md',
					'RUN test ! -e /context/.husky/pre-push',
					'RUN test ! -e /context/flake.nix',
					'RUN test ! -e /context/eslint.config.js',
					'RUN test ! -e /context/.prettierrc.json',
					'RUN test ! -e /context/tests/docker-build-context.test.ts',
					'RUN test ! -e /context/docs/architecture.md',
					'RUN test ! -e /context/audit/report.md',
					'RUN test ! -e /context/scripts/build-production-image-smoke.sh',
					'RUN test ! -e /context/apps/hub/src/build.test.ts',
					'RUN test ! -e /context/packages/ui/index.test.ts',
					'RUN test ! -e /context/apps/hub/src/routes/__tests__/unexpected-error/+page.server.ts',
					'RUN test -e /context/apps/hub/src/routes/+layout.server.ts',
					'RUN test -e /context/package.json',
					'RUN test -e /context/Dockerfile'
				].join('\n')
			);

			const buildResult = runDockerBuild(contextRoot, [
				'--file',
				PROBE_DOCKERFILE_PATH,
				'--tag',
				PROBE_IMAGE_TAG,
				'.'
			]);

			assert.strictEqual(
				buildResult.status,
				0,
				buildResult.stderr || buildResult.stdout
			);
		}
	);
});
