import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('hub build freshness behavior', () => {
	it('rechecks tracked inputs on every ensureBuildFresh call', async () => {
		const runBuild = mock.fn(() => undefined);
		const { ensureBuildFresh } = await import('./helpers/hub-build.ts');
		const baseTimeMs = Date.now() - 60_000;
		const fixtureRoot = mkdtempSync(
			path.join(tmpdir(), 'kaivalo-hub-build-freshness-')
		);
		const buildDir = path.join(fixtureRoot, 'build');
		const buildEntry = path.join(buildDir, 'index.js');
		const trackedInput = path.join(fixtureRoot, 'src', 'entry.ts');

		mkdirSync(path.dirname(trackedInput), { recursive: true });
		mkdirSync(buildDir, { recursive: true });
		writeFileSync(buildEntry, 'export default true;\n');
		writeFileSync(trackedInput, 'export const page = true;\n');

		try {
			utimesSync(
				buildEntry,
				new Date(baseTimeMs + 5_000),
				new Date(baseTimeMs + 5_000)
			);
			utimesSync(
				trackedInput,
				new Date(baseTimeMs + 1_000),
				new Date(baseTimeMs + 1_000)
			);

			assert.strictEqual(
				ensureBuildFresh({
					buildDir,
					buildEntry,
					inputPaths: [trackedInput],
					runBuild
				}),
				false
			);
			assert.strictEqual(runBuild.mock.calls.length, 0);

			utimesSync(
				trackedInput,
				new Date(baseTimeMs + 10_000),
				new Date(baseTimeMs + 10_000)
			);

			assert.strictEqual(
				ensureBuildFresh({
					buildDir,
					buildEntry,
					inputPaths: [trackedInput],
					runBuild
				}),
				true
			);
			assert.strictEqual(runBuild.mock.calls.length, 1);
			assert.match(readFileSync(buildEntry, 'utf8'), /export default true/);
		} finally {
			rmSync(fixtureRoot, { recursive: true, force: true });
			mock.restoreAll();
		}
	});
});
