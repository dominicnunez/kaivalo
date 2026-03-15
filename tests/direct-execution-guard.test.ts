import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isExecutedDirectly } from '../scripts/is-executed-directly.ts';

describe('direct execution guards', () => {
	it('matches the current module when the script is invoked directly', () => {
		const scriptPath = path.join(
			process.cwd(),
			'scripts',
			'check-node-version.ts'
		);

		assert.strictEqual(
			isExecutedDirectly(pathToFileURL(scriptPath).href, [
				process.execPath,
				scriptPath
			]),
			true
		);
	});

	it('matches direct invocations from paths with reserved url characters', () => {
		const tempDir = mkdtempSync(
			path.join(tmpdir(), 'kaivalo-direct-execution-#%-')
		);

		try {
			const scriptPath = path.join(tempDir, 'check#npm%audit.ts');

			assert.strictEqual(
				isExecutedDirectly(pathToFileURL(scriptPath).href, [
					process.execPath,
					scriptPath
				]),
				true
			);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('fails closed when node did not receive a direct script entrypoint', () => {
		const scriptPath = path.join(
			process.cwd(),
			'scripts',
			'check-node-version.ts'
		);

		assert.strictEqual(
			isExecutedDirectly(pathToFileURL(scriptPath).href, [process.execPath]),
			false
		);
	});
});
