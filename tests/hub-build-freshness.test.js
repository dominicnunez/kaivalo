import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
});
