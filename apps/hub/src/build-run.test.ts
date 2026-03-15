import type { SpawnSyncReturns } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

import { runHubBuildWithEnv } from '../scripts/build-env.ts';

describe('hub build runner', () => {
	it('reports the terminating signal when vite build is killed', async () => {
		const removeSourceMaps = vi.fn();
		const assertNodeVersion = vi.fn();
		const runStep = vi.fn().mockReturnValueOnce({
			pid: 123,
			output: [null, Buffer.alloc(0), Buffer.alloc(0)],
			stdout: Buffer.alloc(0),
			stderr: Buffer.alloc(0),
			status: null,
			signal: 'SIGTERM'
		} satisfies SpawnSyncReturns<Buffer>);

		expect(() =>
			runHubBuildWithEnv({
				baseEnv: {
					NODE_ENV: 'test'
				},
				getBuildPaths: () => ({
					buildDir: '/tmp/kaivalo-hub-build',
					clientDir: '/tmp/kaivalo-hub-build/client',
					serverDir: '/tmp/kaivalo-hub-build/server',
					repoRoot: '/tmp/kaivalo'
				}),
				assertNodeVersion,
				removeSourceMaps,
				runStep
			})
		).toThrow('vite build terminated by SIGTERM');
		expect(assertNodeVersion).toHaveBeenCalledTimes(1);
		expect(removeSourceMaps).not.toHaveBeenCalled();
	});

	it('wraps spawn failures with the failed build step context', () => {
		const removeSourceMaps = vi.fn();
		const assertNodeVersion = vi.fn();
		const spawnError = new Error('spawnSync vite ENOENT');
		const runStep = vi.fn().mockReturnValueOnce({
			pid: 0,
			output: [null, Buffer.alloc(0), Buffer.alloc(0)],
			stdout: Buffer.alloc(0),
			stderr: Buffer.alloc(0),
			status: null,
			signal: null,
			error: spawnError
		} satisfies SpawnSyncReturns<Buffer>);

		let thrownError: unknown;
		try {
			runHubBuildWithEnv({
				baseEnv: {
					NODE_ENV: 'test'
				},
				getBuildPaths: () => ({
					buildDir: '/tmp/kaivalo-hub-build',
					clientDir: '/tmp/kaivalo-hub-build/client',
					serverDir: '/tmp/kaivalo-hub-build/server',
					repoRoot: '/tmp/kaivalo'
				}),
				assertNodeVersion,
				removeSourceMaps,
				runStep
			});
		} catch (error) {
			thrownError = error;
		}

		expect(assertNodeVersion).toHaveBeenCalledTimes(1);
		expect(removeSourceMaps).not.toHaveBeenCalled();
		expect(thrownError).toBeInstanceOf(Error);
		expect((thrownError as Error).message).toContain('vite build');
		expect((thrownError as Error & { cause?: unknown }).cause).toBe(spawnError);
	});

	it('uses the current node interpreter for the runtime preparation step', () => {
		const removeSourceMaps = vi.fn();
		const assertNodeVersion = vi.fn();
		const runStep = vi
			.fn()
			.mockReturnValueOnce({
				pid: 123,
				output: [null, Buffer.alloc(0), Buffer.alloc(0)],
				stdout: Buffer.alloc(0),
				stderr: Buffer.alloc(0),
				status: 0,
				signal: null
			} satisfies SpawnSyncReturns<Buffer>)
			.mockReturnValueOnce({
				pid: 124,
				output: [null, Buffer.alloc(0), Buffer.alloc(0)],
				stdout: Buffer.alloc(0),
				stderr: Buffer.alloc(0),
				status: 0,
				signal: null
			} satisfies SpawnSyncReturns<Buffer>);

		runHubBuildWithEnv({
			baseEnv: {
				NODE_ENV: 'test'
			},
			getBuildPaths: () => ({
				buildDir: '/tmp/kaivalo-hub-build',
				clientDir: '/tmp/kaivalo-hub-build/client',
				serverDir: '/tmp/kaivalo-hub-build/server',
				repoRoot: '/tmp/kaivalo'
			}),
			assertNodeVersion,
			removeSourceMaps,
			runStep
		});

		expect(assertNodeVersion).toHaveBeenCalledTimes(1);
		expect(runStep).toHaveBeenNthCalledWith(
			1,
			'vite',
			['build'],
			expect.any(Object)
		);
		expect(runStep).toHaveBeenNthCalledWith(
			2,
			process.execPath,
			['scripts/prepare-runtime.ts'],
			expect.any(Object)
		);
		expect(removeSourceMaps).toHaveBeenCalledWith(
			'/tmp/kaivalo-hub-build/server'
		);
	});

	it('fails before spawning build steps when the runtime version is unsupported', () => {
		const assertNodeVersion = vi.fn(() => {
			throw new Error(
				'Unsupported Node.js runtime: expected 24.14.0, received 22.22.1.'
			);
		});
		const runStep = vi.fn();

		expect(() =>
			runHubBuildWithEnv({
				baseEnv: {
					NODE_ENV: 'test'
				},
				getBuildPaths: () => ({
					buildDir: '/tmp/kaivalo-hub-build',
					clientDir: '/tmp/kaivalo-hub-build/client',
					serverDir: '/tmp/kaivalo-hub-build/server',
					repoRoot: '/tmp/kaivalo'
				}),
				assertNodeVersion,
				removeSourceMaps: vi.fn(),
				runStep
			})
		).toThrow(/Unsupported Node\.js runtime/);
		expect(runStep).not.toHaveBeenCalled();
	});
});
