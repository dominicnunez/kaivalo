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
	const invocationLogPath = path.join(tempDirectory, 'docker.log');

	tempDirectories.add(tempDirectory);
	writeFileSync(
		fakeDockerPath,
		[
			'#!/usr/bin/env bash',
			'set -euo pipefail',
			'printf "%s\\n" "$*" >> "$FAKE_DOCKER_LOG"',
			'if [[ "${1:-}" == "build" ]]; then',
			'	exit "${FAKE_DOCKER_BUILD_EXIT_CODE:-0}"',
			'fi',
			'exit 0'
		].join('\n'),
		{
			mode: 0o755
		}
	);

	return {
		fakeDockerPath,
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
	it('builds the production Dockerfile and removes the temporary image tag', async () => {
		const { fakeDockerPath, invocationLogPath } = createFakeDocker();
		const result = await runSmokeBuildScript({
			environmentOverrides: {
				DOCKER_BIN: fakeDockerPath,
				FAKE_DOCKER_LOG: invocationLogPath,
				PRODUCTION_IMAGE_SMOKE_TAG: 'kaivalo-hub-smoke:test'
			}
		});

		assert.strictEqual(result.exitCode, 0, result.stderr || result.stdout);
		assert.strictEqual(result.signal, null);
		assert.deepStrictEqual(
			readFileSync(invocationLogPath, 'utf8').trim().split('\n'),
			[
				'build --file ./Dockerfile --tag kaivalo-hub-smoke:test .',
				'image rm --force kaivalo-hub-smoke:test'
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
				'build --file ./Dockerfile --tag kaivalo-hub-smoke:test-failure .',
				'image rm --force kaivalo-hub-smoke:test-failure'
			]
		);
	});
});
