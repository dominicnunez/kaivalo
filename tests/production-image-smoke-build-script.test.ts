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

type ScriptResult = {
	exitCode: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
};

const tempDirectories = new Set<string>();

function createFakeDocker() {
	const tempDirectory = mkdtempSync(
		path.join(os.tmpdir(), 'kaivalo-production-image-smoke-')
	);
	const fakeDockerPath = path.join(tempDirectory, 'docker');
	const fakeCurlPath = path.join(tempDirectory, 'curl');
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
		fakeCurlPath,
		[
			'#!/usr/bin/env bash',
			'set -euo pipefail',
			'printf "curl %s\\n" "$*" >> "$FAKE_DOCKER_LOG"',
			'printf "%s" "${FAKE_CURL_RESPONSE_BODY:-ok}"',
			'exit "${FAKE_CURL_EXIT_CODE:-0}"'
		].join('\n'),
		{
			mode: 0o755
		}
	);

	return {
		fakeDockerPath,
		fakeCurlPath,
		invocationLogPath
	};
}

function runSmokeBuildScript({
	environmentOverrides = {}
}: {
	environmentOverrides?: Record<string, string>;
} = {}): Promise<ScriptResult> {
	return new Promise((resolve, reject) => {
		const child = spawn('bash', [PRODUCTION_IMAGE_SMOKE_BUILD_SCRIPT_PATH], {
			cwd: ROOT,
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

function assertCommandSequence(
	lines: readonly string[],
	expectedPatterns: readonly RegExp[]
): void {
	assert.strictEqual(lines.length, expectedPatterns.length);
	for (const [index, expectedPattern] of expectedPatterns.entries()) {
		assert.match(lines[index] ?? '', expectedPattern);
	}
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
	it('builds the production Dockerfile, probes the container health, and removes the temporary resources', async () => {
		const { fakeCurlPath, fakeDockerPath, invocationLogPath } =
			createFakeDocker();
		const result = await runSmokeBuildScript({
			environmentOverrides: {
				CURL_BIN: fakeCurlPath,
				DOCKER_BIN: fakeDockerPath,
				FAKE_DOCKER_LOG: invocationLogPath,
				PRODUCTION_IMAGE_SMOKE_TAG: SMOKE_IMAGE_TAG
			}
		});

		assert.strictEqual(result.exitCode, 0, result.stderr || result.stdout);
		assert.strictEqual(result.signal, null);
		const invocations = readInvocationLog(invocationLogPath);

		assertCommandSequence(invocations, [
			/^docker build\b/,
			/^docker run\b/,
			/^docker port\b/,
			/^curl\b/,
			/^docker container rm\b/,
			/^docker image rm\b/
		]);
		assertCommandIncludes(invocations[0] ?? '', [
			'--file ./Dockerfile',
			`--tag ${SMOKE_IMAGE_TAG}`,
			' .'
		]);
		assertCommandIncludes(invocations[1] ?? '', [
			'--publish 127.0.0.1::3100',
			SMOKE_IMAGE_TAG
		]);
		assertCommandIncludes(invocations[2] ?? '', [
			SMOKE_CONTAINER_ID,
			'3100/tcp'
		]);
		assertCommandIncludes(invocations[3] ?? '', [
			`http://127.0.0.1:${SMOKE_PUBLISHED_PORT}/healthz`
		]);
		assertCommandIncludes(invocations[4] ?? '', [
			'--force',
			SMOKE_CONTAINER_ID
		]);
		assertCommandIncludes(invocations[5] ?? '', ['--force', SMOKE_IMAGE_TAG]);
	});

	it('removes the temporary image tag even when the docker build fails', async () => {
		const { fakeDockerPath, invocationLogPath } = createFakeDocker();
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

		assertCommandSequence(invocations, [
			/^docker build\b/,
			/^docker image rm\b/
		]);
		assertCommandIncludes(invocations[0] ?? '', [
			'--file ./Dockerfile',
			'--tag kaivalo-hub-smoke:test-failure',
			' .'
		]);
		assertCommandIncludes(invocations[1] ?? '', [
			'--force',
			'kaivalo-hub-smoke:test-failure'
		]);
	});

	it('reuses a prebuilt image when smoke-build skip mode is enabled', async () => {
		const { fakeCurlPath, fakeDockerPath, invocationLogPath } =
			createFakeDocker();
		const result = await runSmokeBuildScript({
			environmentOverrides: {
				CURL_BIN: fakeCurlPath,
				DOCKER_BIN: fakeDockerPath,
				FAKE_DOCKER_LOG: invocationLogPath,
				PRODUCTION_IMAGE_SMOKE_SKIP_BUILD: 'true',
				PRODUCTION_IMAGE_SMOKE_TAG: SMOKE_IMAGE_TAG
			}
		});

		assert.strictEqual(result.exitCode, 0, result.stderr || result.stdout);
		assert.strictEqual(result.signal, null);
		const invocations = readInvocationLog(invocationLogPath);

		assertCommandSequence(invocations, [
			/^docker run\b/,
			/^docker port\b/,
			/^curl\b/,
			/^docker container rm\b/
		]);
		assertCommandIncludes(invocations[0] ?? '', [
			'--publish 127.0.0.1::3100',
			SMOKE_IMAGE_TAG
		]);
	});

	it('keeps a reused image tag when skip mode fails after the container starts', async () => {
		const { fakeCurlPath, fakeDockerPath, invocationLogPath } =
			createFakeDocker();
		const result = await runSmokeBuildScript({
			environmentOverrides: {
				CURL_BIN: fakeCurlPath,
				DOCKER_BIN: fakeDockerPath,
				FAKE_CURL_RESPONSE_BODY: 'degraded',
				FAKE_DOCKER_LOG: invocationLogPath,
				FAKE_DOCKER_LOGS_OUTPUT: 'container failed to start',
				PRODUCTION_IMAGE_SMOKE_SKIP_BUILD: 'true',
				PRODUCTION_IMAGE_SMOKE_TAG: SMOKE_IMAGE_TAG
			}
		});

		assert.strictEqual(result.exitCode, 1, result.stderr || result.stdout);
		const invocations = readInvocationLog(invocationLogPath);

		assertCommandSequence(invocations, [
			/^docker run\b/,
			/^docker port\b/,
			/^curl\b/,
			/^docker logs\b/,
			/^docker container rm\b/
		]);
		assertCommandIncludes(invocations[3] ?? '', [SMOKE_CONTAINER_ID]);
		assertCommandIncludes(invocations[4] ?? '', [
			'--force',
			SMOKE_CONTAINER_ID
		]);
	});

	it('prints container logs and removes temporary resources when the health probe body is unhealthy', async () => {
		const { fakeCurlPath, fakeDockerPath, invocationLogPath } =
			createFakeDocker();
		const result = await runSmokeBuildScript({
			environmentOverrides: {
				CURL_BIN: fakeCurlPath,
				DOCKER_BIN: fakeDockerPath,
				FAKE_CURL_RESPONSE_BODY: 'degraded',
				FAKE_DOCKER_LOG: invocationLogPath,
				FAKE_DOCKER_LOGS_OUTPUT: 'container failed to start',
				PRODUCTION_IMAGE_SMOKE_TAG: SMOKE_IMAGE_TAG
			}
		});

		assert.strictEqual(result.exitCode, 1, result.stderr || result.stdout);
		assert.match(
			result.stderr,
			/Expected \/healthz to return ok, received: degraded/
		);
		assert.match(result.stderr, /container failed to start/);
		const invocations = readInvocationLog(invocationLogPath);

		assertCommandSequence(invocations, [
			/^docker build\b/,
			/^docker run\b/,
			/^docker port\b/,
			/^curl\b/,
			/^docker logs\b/,
			/^docker container rm\b/,
			/^docker image rm\b/
		]);
		assertCommandIncludes(invocations[4] ?? '', [SMOKE_CONTAINER_ID]);
		assertCommandIncludes(invocations[5] ?? '', [
			'--force',
			SMOKE_CONTAINER_ID
		]);
		assertCommandIncludes(invocations[6] ?? '', ['--force', SMOKE_IMAGE_TAG]);
	});
});
