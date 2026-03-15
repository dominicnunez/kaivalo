import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const PRODUCTION_IMAGE_SMOKE_BUILD_SCRIPT_PATH = path.join(
	ROOT,
	'scripts',
	'build-production-image-smoke.sh'
);
const SMOKE_IMAGE_TAG = 'kaivalo-hub-smoke:test';
const SMOKE_CONTAINER_ID = 'container-smoke-123';
const SMOKE_PUBLISHED_PORT = '41234';
const SMOKE_CANONICAL_ORIGIN = 'http://127.0.0.1:3100';
const REPO_DOCKERFILE_PATH = path.join(ROOT, 'Dockerfile');

type ScriptResult = {
	exitCode: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
};

const tempDirectories = new Set<string>();

function createFakeSmokeDependencies() {
	const tempDirectory = mkdtempSync(
		path.join(os.tmpdir(), 'kaivalo-production-image-smoke-')
	);
	const fakeDockerPath = path.join(tempDirectory, 'docker');
	const fakeVerifyDeployHealthPath = path.join(
		tempDirectory,
		'verify-deploy-health.sh'
	);
	const invocationLogPath = path.join(tempDirectory, 'docker.log');

	tempDirectories.add(tempDirectory);
	writeFileSync(
		fakeDockerPath,
		[
			'#!/usr/bin/env bash',
			'set -euo pipefail',
			'printf "docker %s\\n" "$*" >> "$FAKE_DOCKER_LOG"',
			'case "${1:-}" in',
			'	build)',
			'		exit "${FAKE_DOCKER_BUILD_EXIT_CODE:-0}"',
			'		;;',
			'	run)',
			'		printf "%s\\n" "${FAKE_DOCKER_RUN_OUTPUT:-container-smoke-123}"',
			'		exit "${FAKE_DOCKER_RUN_EXIT_CODE:-0}"',
			'		;;',
			'	port)',
			'		printf "%s\\n" "${FAKE_DOCKER_PORT_OUTPUT:-127.0.0.1:41234}"',
			'		exit "${FAKE_DOCKER_PORT_EXIT_CODE:-0}"',
			'		;;',
			'	logs)',
			'		printf "%s\\n" "${FAKE_DOCKER_LOGS_OUTPUT:-container logs}" >&2',
			'		exit 0',
			'		;;',
			'	container)',
			'		if [[ "${2:-}" == "rm" ]]; then',
			'			exit 0',
			'		fi',
			'		;;',
			'	image)',
			'		if [[ "${2:-}" == "rm" ]]; then',
			'			exit 0',
			'		fi',
			'		;;',
			'esac',
			'exit 0'
		].join('\n'),
		{
			mode: 0o755
		}
	);
	writeFileSync(
		fakeVerifyDeployHealthPath,
		[
			'#!/usr/bin/env bash',
			'set -euo pipefail',
			'printf "verify DEPLOY_ORIGIN=%s DEPLOY_PROBE_ORIGIN=%s WORKOS_API_HOSTNAME=%s\\n" "$DEPLOY_ORIGIN" "$DEPLOY_PROBE_ORIGIN" "${WORKOS_API_HOSTNAME:-}" >> "$FAKE_DOCKER_LOG"',
			'if [[ -n "${FAKE_VERIFY_DEPLOY_HEALTH_STDERR:-}" ]]; then',
			'	printf "%s\\n" "$FAKE_VERIFY_DEPLOY_HEALTH_STDERR" >&2',
			'fi',
			'exit "${FAKE_VERIFY_DEPLOY_HEALTH_EXIT_CODE:-0}"'
		].join('\n'),
		{
			mode: 0o755
		}
	);

	return {
		fakeDockerPath,
		fakeVerifyDeployHealthPath,
		invocationLogPath
	};
}

function runSmokeBuildScript({
	cwd = ROOT,
	environmentOverrides = {}
}: {
	cwd?: string;
	environmentOverrides?: Record<string, string>;
} = {}): Promise<ScriptResult> {
	return new Promise((resolve, reject) => {
		const child = spawn('bash', [PRODUCTION_IMAGE_SMOKE_BUILD_SCRIPT_PATH], {
			cwd,
			env: {
				...process.env,
				...environmentOverrides
			},
			stdio: ['ignore', 'pipe', 'pipe']
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];

		child.once('error', reject);
		child.stdout?.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
		child.stderr?.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
		child.once('exit', (exitCode, signal) => {
			resolve({
				exitCode,
				signal,
				stdout: Buffer.concat(stdout).toString('utf8'),
				stderr: Buffer.concat(stderr).toString('utf8')
			});
		});
	});
}

function readInvocationLog(invocationLogPath: string): string[] {
	return readFileSync(invocationLogPath, 'utf8')
		.trim()
		.split('\n')
		.filter((line) => line !== '');
}

function findInvocationIndex(
	lines: readonly string[],
	pattern: RegExp
): number {
	return lines.findIndex((line) => pattern.test(line));
}

function assertHasInvocation(
	lines: readonly string[],
	pattern: RegExp,
	description: string
): { index: number; line: string } {
	const index = findInvocationIndex(lines, pattern);
	assert.ok(index >= 0, `expected ${description}`);
	return {
		index,
		line: lines[index] ?? ''
	};
}

function assertLacksInvocation(
	lines: readonly string[],
	pattern: RegExp,
	description: string
): void {
	assert.strictEqual(
		findInvocationIndex(lines, pattern),
		-1,
		`did not expect ${description}`
	);
}

function assertInvocationOrder(
	earlierInvocation: { index: number },
	laterInvocation: { index: number },
	description: string
): void {
	assert.ok(
		earlierInvocation.index < laterInvocation.index,
		`expected ${description}`
	);
}

function assertCommandIncludes(
	line: string,
	expectedFragments: readonly string[]
): void {
	for (const fragment of expectedFragments) {
		assert.ok(
			line.includes(fragment),
			`expected command to include ${fragment}, received: ${line}`
		);
	}
}

afterEach(() => {
	for (const tempDirectory of Array.from(tempDirectories)) {
		tempDirectories.delete(tempDirectory);
		rmSync(tempDirectory, {
			force: true,
			recursive: true
		});
	}
});

describe('production image smoke build script', () => {
	it('builds the production Dockerfile, verifies the deployed container contract, and removes the temporary resources', async () => {
		const { fakeDockerPath, fakeVerifyDeployHealthPath, invocationLogPath } =
			createFakeSmokeDependencies();
		const result = await runSmokeBuildScript({
			environmentOverrides: {
				DOCKER_BIN: fakeDockerPath,
				FAKE_DOCKER_LOG: invocationLogPath,
				PRODUCTION_IMAGE_SMOKE_DEPLOY_HEALTH_SCRIPT: fakeVerifyDeployHealthPath,
				PRODUCTION_IMAGE_SMOKE_TAG: SMOKE_IMAGE_TAG
			}
		});

		assert.strictEqual(result.exitCode, 0, result.stderr || result.stdout);
		assert.strictEqual(result.signal, null);
		const invocations = readInvocationLog(invocationLogPath);
		const buildInvocation = assertHasInvocation(
			invocations,
			/^docker build\b/,
			'a docker build invocation when skip mode is off'
		);
		const runInvocation = assertHasInvocation(
			invocations,
			/^docker run\b/,
			'a docker run invocation'
		);
		const portInvocation = assertHasInvocation(
			invocations,
			/^docker port\b/,
			'a docker port lookup for the smoke container'
		);
		const verifyInvocation = assertHasInvocation(
			invocations,
			/^verify\b/,
			'the shared deploy health verification step'
		);
		const containerCleanupInvocation = assertHasInvocation(
			invocations,
			/^docker container rm\b/,
			'container cleanup after verification'
		);
		const imageCleanupInvocation = assertHasInvocation(
			invocations,
			/^docker image rm\b/,
			'image cleanup for a tag created by this run'
		);

		assertInvocationOrder(
			buildInvocation,
			runInvocation,
			'the image should be built before the smoke container starts'
		);
		assertInvocationOrder(
			runInvocation,
			portInvocation,
			'the smoke container should start before its published port is resolved'
		);
		assertInvocationOrder(
			portInvocation,
			verifyInvocation,
			'the deploy verifier should run after the published port is resolved'
		);
		assertInvocationOrder(
			verifyInvocation,
			containerCleanupInvocation,
			'the smoke container should be cleaned up after verification finishes'
		);
		assertInvocationOrder(
			containerCleanupInvocation,
			imageCleanupInvocation,
			'the temporary image tag should be removed after the container cleanup'
		);

		assertCommandIncludes(buildInvocation.line, [
			`--file ${REPO_DOCKERFILE_PATH}`,
			`--tag ${SMOKE_IMAGE_TAG}`,
			` ${ROOT}`
		]);
		assertCommandIncludes(runInvocation.line, [
			'--publish 127.0.0.1::3100',
			`--env ORIGIN=${SMOKE_CANONICAL_ORIGIN}`,
			`--env WORKOS_REDIRECT_URI=${SMOKE_CANONICAL_ORIGIN}/auth/callback`,
			SMOKE_IMAGE_TAG
		]);
		assertCommandIncludes(portInvocation.line, [
			SMOKE_CONTAINER_ID,
			'3100/tcp'
		]);
		assertCommandIncludes(verifyInvocation.line, [
			`DEPLOY_ORIGIN=${SMOKE_CANONICAL_ORIGIN}`,
			`DEPLOY_PROBE_ORIGIN=http://127.0.0.1:${SMOKE_PUBLISHED_PORT}`
		]);
		assertCommandIncludes(containerCleanupInvocation.line, [
			'--force',
			SMOKE_CONTAINER_ID
		]);
		assertCommandIncludes(imageCleanupInvocation.line, [
			'--force',
			SMOKE_IMAGE_TAG
		]);
	});

	it('resolves the repository build context even when invoked outside the repo root', async () => {
		const { fakeDockerPath, fakeVerifyDeployHealthPath, invocationLogPath } =
			createFakeSmokeDependencies();
		const externalCwd = mkdtempSync(
			path.join(os.tmpdir(), 'kaivalo-production-image-smoke-cwd-')
		);

		tempDirectories.add(externalCwd);
		const result = await runSmokeBuildScript({
			cwd: externalCwd,
			environmentOverrides: {
				DOCKER_BIN: fakeDockerPath,
				FAKE_DOCKER_LOG: invocationLogPath,
				PRODUCTION_IMAGE_SMOKE_DEPLOY_HEALTH_SCRIPT: fakeVerifyDeployHealthPath,
				PRODUCTION_IMAGE_SMOKE_TAG: SMOKE_IMAGE_TAG
			}
		});

		assert.strictEqual(result.exitCode, 0, result.stderr || result.stdout);
		const invocations = readInvocationLog(invocationLogPath);
		const buildInvocation = assertHasInvocation(
			invocations,
			/^docker build\b/,
			'a docker build invocation'
		);

		assertCommandIncludes(buildInvocation.line, [
			`--file ${REPO_DOCKERFILE_PATH}`,
			` ${ROOT}`
		]);
	});

	it('preserves a caller-supplied image tag when the docker build fails', async () => {
		const { fakeDockerPath, invocationLogPath } = createFakeSmokeDependencies();
		const result = await runSmokeBuildScript({
			environmentOverrides: {
				DOCKER_BIN: fakeDockerPath,
				FAKE_DOCKER_BUILD_EXIT_CODE: '55',
				FAKE_DOCKER_LOG: invocationLogPath,
				PRODUCTION_IMAGE_SMOKE_TAG: 'kaivalo-hub-smoke:test-failure'
			}
		});

		assert.strictEqual(result.exitCode, 55, result.stderr || result.stdout);
		const invocations = readInvocationLog(invocationLogPath);
		const buildInvocation = assertHasInvocation(
			invocations,
			/^docker build\b/,
			'a docker build invocation'
		);

		assertLacksInvocation(
			invocations,
			/^docker run\b/,
			'a smoke container start when the image build fails'
		);
		assertLacksInvocation(
			invocations,
			/^verify\b/,
			'deploy verification when the image build fails'
		);
		assertLacksInvocation(
			invocations,
			/^docker image rm\b/,
			'image cleanup for a tag the script did not finish creating'
		);

		assertCommandIncludes(buildInvocation.line, [
			`--file ${REPO_DOCKERFILE_PATH}`,
			'--tag kaivalo-hub-smoke:test-failure',
			` ${ROOT}`
		]);
	});

	it('reuses a prebuilt image when smoke-build skip mode is enabled', async () => {
		const { fakeDockerPath, fakeVerifyDeployHealthPath, invocationLogPath } =
			createFakeSmokeDependencies();
		const result = await runSmokeBuildScript({
			environmentOverrides: {
				DOCKER_BIN: fakeDockerPath,
				FAKE_DOCKER_LOG: invocationLogPath,
				PRODUCTION_IMAGE_SMOKE_DEPLOY_HEALTH_SCRIPT: fakeVerifyDeployHealthPath,
				PRODUCTION_IMAGE_SMOKE_SKIP_BUILD: 'true',
				PRODUCTION_IMAGE_SMOKE_TAG: SMOKE_IMAGE_TAG
			}
		});

		assert.strictEqual(result.exitCode, 0, result.stderr || result.stdout);
		assert.strictEqual(result.signal, null);
		const invocations = readInvocationLog(invocationLogPath);
		const runInvocation = assertHasInvocation(
			invocations,
			/^docker run\b/,
			'a smoke container start in skip-build mode'
		);
		const portInvocation = assertHasInvocation(
			invocations,
			/^docker port\b/,
			'a published-port lookup in skip-build mode'
		);
		const verifyInvocation = assertHasInvocation(
			invocations,
			/^verify\b/,
			'deploy verification in skip-build mode'
		);
		const containerCleanupInvocation = assertHasInvocation(
			invocations,
			/^docker container rm\b/,
			'container cleanup in skip-build mode'
		);

		assertLacksInvocation(
			invocations,
			/^docker build\b/,
			'a docker build when skip-build mode reuses a prebuilt image'
		);
		assertLacksInvocation(
			invocations,
			/^docker image rm\b/,
			'image cleanup for a reused prebuilt image'
		);
		assertInvocationOrder(
			runInvocation,
			portInvocation,
			'the container should start before resolving its published port'
		);
		assertInvocationOrder(
			portInvocation,
			verifyInvocation,
			'the verifier should use the discovered published port'
		);
		assertInvocationOrder(
			verifyInvocation,
			containerCleanupInvocation,
			'the reused container should be cleaned up after verification'
		);

		assertCommandIncludes(runInvocation.line, [
			'--publish 127.0.0.1::3100',
			SMOKE_IMAGE_TAG
		]);
	});

	it('forwards a configured WorkOS auth hostname to the smoke container and deploy verifier', async () => {
		const { fakeDockerPath, fakeVerifyDeployHealthPath, invocationLogPath } =
			createFakeSmokeDependencies();
		const workosApiHostname = 'auth.kaivalo-login.com';
		const result = await runSmokeBuildScript({
			environmentOverrides: {
				DOCKER_BIN: fakeDockerPath,
				FAKE_DOCKER_LOG: invocationLogPath,
				PRODUCTION_IMAGE_SMOKE_DEPLOY_HEALTH_SCRIPT: fakeVerifyDeployHealthPath,
				PRODUCTION_IMAGE_SMOKE_TAG: SMOKE_IMAGE_TAG,
				WORKOS_API_HOSTNAME: workosApiHostname
			}
		});

		assert.strictEqual(result.exitCode, 0, result.stderr || result.stdout);
		assert.strictEqual(result.signal, null);
		const invocations = readInvocationLog(invocationLogPath);
		const runInvocation = assertHasInvocation(
			invocations,
			/^docker run\b/,
			'a smoke container start'
		);
		const verifyInvocation = assertHasInvocation(
			invocations,
			/^verify\b/,
			'deploy verification'
		);

		assertCommandIncludes(runInvocation.line, [
			`--env WORKOS_API_HOSTNAME=${workosApiHostname}`
		]);
		assertCommandIncludes(verifyInvocation.line, [
			`WORKOS_API_HOSTNAME=${workosApiHostname}`
		]);
	});

	it('keeps a reused image tag when skip mode fails after the container starts', async () => {
		const { fakeDockerPath, fakeVerifyDeployHealthPath, invocationLogPath } =
			createFakeSmokeDependencies();
		const result = await runSmokeBuildScript({
			environmentOverrides: {
				DOCKER_BIN: fakeDockerPath,
				FAKE_DOCKER_LOG: invocationLogPath,
				FAKE_DOCKER_LOGS_OUTPUT: 'container failed to start',
				FAKE_VERIFY_DEPLOY_HEALTH_EXIT_CODE: '1',
				PRODUCTION_IMAGE_SMOKE_SKIP_BUILD: 'true',
				PRODUCTION_IMAGE_SMOKE_DEPLOY_HEALTH_SCRIPT: fakeVerifyDeployHealthPath,
				PRODUCTION_IMAGE_SMOKE_TAG: SMOKE_IMAGE_TAG
			}
		});

		assert.strictEqual(result.exitCode, 1, result.stderr || result.stdout);
		const invocations = readInvocationLog(invocationLogPath);
		const runInvocation = assertHasInvocation(
			invocations,
			/^docker run\b/,
			'a smoke container start in skip-build mode'
		);
		const verifyInvocation = assertHasInvocation(
			invocations,
			/^verify\b/,
			'deploy verification in skip-build mode'
		);
		const logsInvocation = assertHasInvocation(
			invocations,
			/^docker logs\b/,
			'container log collection when deploy verification fails'
		);
		const containerCleanupInvocation = assertHasInvocation(
			invocations,
			/^docker container rm\b/,
			'container cleanup after verifier failure'
		);

		assertLacksInvocation(
			invocations,
			/^docker build\b/,
			'a docker build when skip-build mode reuses an image'
		);
		assertLacksInvocation(
			invocations,
			/^docker image rm\b/,
			'image cleanup for a reused image tag'
		);
		assertInvocationOrder(
			runInvocation,
			verifyInvocation,
			'the verifier should run after the reused container starts'
		);
		assertInvocationOrder(
			verifyInvocation,
			logsInvocation,
			'container logs should be collected after verification fails'
		);
		assertInvocationOrder(
			logsInvocation,
			containerCleanupInvocation,
			'the failed container should be cleaned up after logs are collected'
		);
		assert.match(result.stderr, /container failed to start/);
		assertCommandIncludes(logsInvocation.line, [SMOKE_CONTAINER_ID]);
		assertCommandIncludes(containerCleanupInvocation.line, [
			'--force',
			SMOKE_CONTAINER_ID
		]);
	});

	it('prints container logs and removes temporary resources when deploy verification fails', async () => {
		const { fakeDockerPath, fakeVerifyDeployHealthPath, invocationLogPath } =
			createFakeSmokeDependencies();
		const result = await runSmokeBuildScript({
			environmentOverrides: {
				DOCKER_BIN: fakeDockerPath,
				FAKE_DOCKER_LOG: invocationLogPath,
				FAKE_DOCKER_LOGS_OUTPUT: 'container failed to start',
				FAKE_VERIFY_DEPLOY_HEALTH_EXIT_CODE: '1',
				FAKE_VERIFY_DEPLOY_HEALTH_STDERR:
					'Expected /services to include cache-control: private, no-store',
				PRODUCTION_IMAGE_SMOKE_DEPLOY_HEALTH_SCRIPT: fakeVerifyDeployHealthPath,
				PRODUCTION_IMAGE_SMOKE_TAG: SMOKE_IMAGE_TAG
			}
		});

		assert.strictEqual(result.exitCode, 1, result.stderr || result.stdout);
		assert.match(
			result.stderr,
			/Expected \/services to include cache-control: private, no-store/
		);
		assert.match(result.stderr, /Production image deploy verification failed/);
		assert.match(result.stderr, /container failed to start/);
		const invocations = readInvocationLog(invocationLogPath);
		const buildInvocation = assertHasInvocation(
			invocations,
			/^docker build\b/,
			'a docker build invocation'
		);
		const runInvocation = assertHasInvocation(
			invocations,
			/^docker run\b/,
			'a smoke container start'
		);
		const verifyInvocation = assertHasInvocation(
			invocations,
			/^verify\b/,
			'deploy verification'
		);
		const logsInvocation = assertHasInvocation(
			invocations,
			/^docker logs\b/,
			'container log collection after verification failure'
		);
		const containerCleanupInvocation = assertHasInvocation(
			invocations,
			/^docker container rm\b/,
			'container cleanup after verification failure'
		);
		const imageCleanupInvocation = assertHasInvocation(
			invocations,
			/^docker image rm\b/,
			'image cleanup for a tag created by this run'
		);

		assertInvocationOrder(
			buildInvocation,
			runInvocation,
			'the image should be built before starting the smoke container'
		);
		assertInvocationOrder(
			runInvocation,
			verifyInvocation,
			'the verifier should run after the smoke container starts'
		);
		assertInvocationOrder(
			verifyInvocation,
			logsInvocation,
			'container logs should be collected after verification fails'
		);
		assertInvocationOrder(
			logsInvocation,
			containerCleanupInvocation,
			'the failed container should be cleaned up after logs are collected'
		);
		assertInvocationOrder(
			containerCleanupInvocation,
			imageCleanupInvocation,
			'the temporary image tag should be removed after container cleanup'
		);
		assertCommandIncludes(logsInvocation.line, [SMOKE_CONTAINER_ID]);
		assertCommandIncludes(containerCleanupInvocation.line, [
			'--force',
			SMOKE_CONTAINER_ID
		]);
		assertCommandIncludes(imageCleanupInvocation.line, [
			'--force',
			SMOKE_IMAGE_TAG
		]);
	});
});
