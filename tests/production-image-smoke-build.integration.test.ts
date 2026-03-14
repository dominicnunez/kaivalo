import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

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

function hasDocker(): boolean {
	return (
		spawnSync('docker', ['--version'], {
			stdio: 'ignore'
		}).status === 0
	);
}

function runSmokeBuildScript(
	environmentOverrides: Record<string, string> = {}
): Promise<ScriptResult> {
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

describe('production image smoke build integration', () => {
	it(
		'runs the real smoke-build script and removes the temporary image',
		{ skip: !hasDocker() },
		async () => {
			const smokeImageTag = `kaivalo-hub-smoke:integration-${Date.now()}-${process.pid}`;
			const result = await runSmokeBuildScript({
				PRODUCTION_IMAGE_SMOKE_TAG: smokeImageTag
			});

			assert.strictEqual(result.exitCode, 0, result.stderr || result.stdout);
			assert.strictEqual(result.signal, null);

			const inspectResult = spawnSync(
				'docker',
				['image', 'inspect', smokeImageTag],
				{
					cwd: ROOT,
					encoding: 'utf8',
					stdio: 'pipe'
				}
			);
			assert.notStrictEqual(
				inspectResult.status,
				0,
				`expected smoke-build script to remove ${smokeImageTag}`
			);
		}
	);
});
