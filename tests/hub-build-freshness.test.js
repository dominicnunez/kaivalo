import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { getHubBuildInputPaths } from './helpers/hub-build.js';

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

	it('copies shared server auth config into the runtime bundle', () => {
		const prepareRuntimeScript = readFileSync(
			path.resolve(
				process.cwd(),
				'apps',
				'hub',
				'scripts',
				'prepare-runtime.mjs'
			),
			'utf8'
		);

		assert.match(prepareRuntimeScript, /'authkit-config\.js'/);
	});
});
