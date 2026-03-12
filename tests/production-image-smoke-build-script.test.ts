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
const SMOKE_WORKOS_COOKIE_PASSWORD =
	'abababababababababababababababababababababababababababababababab';
const SMOKE_AUTH_ERROR_SIGNING_SECRET =
	'cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd';

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
		assert.deepStrictEqual(
			readFileSync(invocationLogPath, 'utf8').trim().split('\n'),
			[
				`docker build --file ./Dockerfile --tag ${SMOKE_IMAGE_TAG} .`,
				`docker run --detach --publish 127.0.0.1::3100 --env AUTH_ERROR_SIGNING_SECRET=${SMOKE_AUTH_ERROR_SIGNING_SECRET} --env ORIGIN=http://127.0.0.1:3100 --env WORKOS_API_KEY=sk_image_smoke --env WORKOS_CLIENT_ID=client_image_smoke --env WORKOS_COOKIE_PASSWORD=${SMOKE_WORKOS_COOKIE_PASSWORD} --env WORKOS_REDIRECT_URI=http://127.0.0.1:3100/auth/callback ${SMOKE_IMAGE_TAG}`,
				`docker port ${SMOKE_CONTAINER_ID} 3100/tcp`,
				`curl --silent --show-error --fail --retry 10 --retry-delay 1 --retry-connrefused --connect-timeout 2 --max-time 5 http://127.0.0.1:${SMOKE_PUBLISHED_PORT}/healthz`,
				`docker container rm --force ${SMOKE_CONTAINER_ID}`,
				`docker image rm --force ${SMOKE_IMAGE_TAG}`
			]
		);
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
		assert.deepStrictEqual(
			readFileSync(invocationLogPath, 'utf8').trim().split('\n'),
			[
				'docker build --file ./Dockerfile --tag kaivalo-hub-smoke:test-failure .',
				'docker image rm --force kaivalo-hub-smoke:test-failure'
			]
		);
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
		assert.deepStrictEqual(
			readFileSync(invocationLogPath, 'utf8').trim().split('\n'),
			[
				`docker build --file ./Dockerfile --tag ${SMOKE_IMAGE_TAG} .`,
				`docker run --detach --publish 127.0.0.1::3100 --env AUTH_ERROR_SIGNING_SECRET=${SMOKE_AUTH_ERROR_SIGNING_SECRET} --env ORIGIN=http://127.0.0.1:3100 --env WORKOS_API_KEY=sk_image_smoke --env WORKOS_CLIENT_ID=client_image_smoke --env WORKOS_COOKIE_PASSWORD=${SMOKE_WORKOS_COOKIE_PASSWORD} --env WORKOS_REDIRECT_URI=http://127.0.0.1:3100/auth/callback ${SMOKE_IMAGE_TAG}`,
				`docker port ${SMOKE_CONTAINER_ID} 3100/tcp`,
				`curl --silent --show-error --fail --retry 10 --retry-delay 1 --retry-connrefused --connect-timeout 2 --max-time 5 http://127.0.0.1:${SMOKE_PUBLISHED_PORT}/healthz`,
				`docker logs ${SMOKE_CONTAINER_ID}`,
				`docker container rm --force ${SMOKE_CONTAINER_ID}`,
				`docker image rm --force ${SMOKE_IMAGE_TAG}`
			]
		);
	});
});
