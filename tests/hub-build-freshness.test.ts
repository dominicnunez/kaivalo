import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
	getHubBuildInputPaths,
	getHubRuntimeServerBuildPaths
} from './helpers/hub-build.ts';

describe('hub build freshness inputs', () => {
	it('tracks shared workspace packages that feed the hub build', () => {
		const buildInputPaths = getHubBuildInputPaths();
		const expectedWorkspacePath = path.resolve(process.cwd(), 'packages', 'ui');

		assert.ok(
			buildInputPaths.includes(expectedWorkspacePath),
			'packages/ui changes must invalidate cached hub builds'
		);
	});

	it('tracks hub build scripts that package the runtime bundle', () => {
		const buildInputPaths = getHubBuildInputPaths();
		const expectedScriptsPath = path.resolve(
			process.cwd(),
			'apps',
			'hub',
			'scripts'
		);

		assert.ok(
			buildInputPaths.includes(expectedScriptsPath),
			'apps/hub/scripts changes must invalidate cached hub builds'
		);
	});

	it('tracks the shared server auth config runtime artifact', () => {
		const runtimeArtifactPaths = getHubRuntimeServerBuildPaths();
		const expectedRuntimeArtifactPath = path.resolve(
			process.cwd(),
			'apps',
			'hub',
			'build',
			'runtime',
			'server',
			'authkit-config.ts'
		);

		assert.ok(
			runtimeArtifactPaths.includes(expectedRuntimeArtifactPath),
			'shared auth config must remain part of the packaged runtime artifact set'
		);
	});
});
