import type { SpawnSyncReturns } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

import { runHubBuildWithEnv } from '../scripts/build-env.ts';

describe('hub build runner', () => {
	it('reports the terminating signal when vite build is killed', async () => {
		const removeSourceMaps = vi.fn();
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
				removeSourceMaps,
				runStep
			})
		).toThrow('vite build terminated by SIGTERM');
		expect(removeSourceMaps).not.toHaveBeenCalled();
	});
});
