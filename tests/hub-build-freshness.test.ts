import { statSync, utimesSync } from 'node:fs';
import path from 'node:path';
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.cwd();
const BUILD_ENTRY = path.resolve(ROOT, 'apps', 'hub', 'build', 'index.js');
const TRACKED_WORKSPACE_INPUT = path.resolve(
	ROOT,
	'packages',
	'ui',
	'package.json'
);

describe('hub build freshness behavior', () => {
	it('rechecks tracked inputs on every ensureBuildFresh call', async () => {
		const buildEntryStats = statSync(BUILD_ENTRY);
		const inputStats = statSync(TRACKED_WORKSPACE_INPUT);
		const runBuild = mock.fn(() => undefined);
		const { ensureBuildFresh } = await import('./helpers/hub-build.ts');
		const baseTimeMs = Date.now() - 60_000;

		try {
			utimesSync(
				BUILD_ENTRY,
				buildEntryStats.atime,
				new Date(baseTimeMs + 5_000)
			);
			utimesSync(
				TRACKED_WORKSPACE_INPUT,
				inputStats.atime,
				new Date(baseTimeMs + 1_000)
			);

			assert.strictEqual(
				ensureBuildFresh({
					buildDir: path.dirname(BUILD_ENTRY),
					buildEntry: BUILD_ENTRY,
					inputPaths: [TRACKED_WORKSPACE_INPUT],
					runBuild
				}),
				false
			);
			assert.strictEqual(runBuild.mock.calls.length, 0);

			utimesSync(
				TRACKED_WORKSPACE_INPUT,
				inputStats.atime,
				new Date(baseTimeMs + 10_000)
			);

			assert.strictEqual(
				ensureBuildFresh({
					buildDir: path.dirname(BUILD_ENTRY),
					buildEntry: BUILD_ENTRY,
					inputPaths: [TRACKED_WORKSPACE_INPUT],
					runBuild
				}),
				true
			);
			assert.strictEqual(runBuild.mock.calls.length, 1);
		} finally {
			utimesSync(BUILD_ENTRY, buildEntryStats.atime, buildEntryStats.mtime);
			utimesSync(TRACKED_WORKSPACE_INPUT, inputStats.atime, inputStats.mtime);
			mock.restoreAll();
		}
	});
});
