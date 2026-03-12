import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	UI_RUNTIME_PACKAGE_FILES,
	materializeUiRuntimePackage
} from '../scripts/materialize-runtime-workspace-deps.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const UI_PACKAGE_JSON_PATH = path.join(ROOT, 'packages', 'ui', 'package.json');

describe('@kaivalo/ui package metadata', () => {
	it('marks the workspace package private to avoid accidental publication', () => {
		const uiPackage = JSON.parse(readFileSync(UI_PACKAGE_JSON_PATH, 'utf8'));

		assert.strictEqual(uiPackage.private, true);
	});

	it('materializes the runtime ui package into node_modules without leaving a workspace symlink behind', () => {
		const tempDir = mkdtempSync(
			path.join(tmpdir(), 'kaivalo-ui-runtime-materialization-')
		);
		const sourceDir = path.join(tempDir, 'packages', 'ui');
		const destinationDir = path.join(tempDir, 'node_modules', '@kaivalo', 'ui');

		try {
			mkdirSync(sourceDir, { recursive: true });
			mkdirSync(path.dirname(destinationDir), { recursive: true });

			for (const fileName of UI_RUNTIME_PACKAGE_FILES) {
				writeFileSync(
					path.join(sourceDir, fileName),
					fileName === 'package.json'
						? JSON.stringify({ name: '@kaivalo/ui', private: true })
						: `fixture:${fileName}`
				);
			}

			symlinkSync('../../packages/ui', destinationDir);

			materializeUiRuntimePackage({
				sourceDir,
				destinationDir
			});

			assert.strictEqual(
				lstatSync(destinationDir).isSymbolicLink(),
				false,
				'runtime package destination should become a real directory'
			);

			for (const fileName of UI_RUNTIME_PACKAGE_FILES) {
				assert.strictEqual(
					readFileSync(path.join(destinationDir, fileName), 'utf8'),
					fileName === 'package.json'
						? JSON.stringify({ name: '@kaivalo/ui', private: true })
						: `fixture:${fileName}`
				);
			}
		} finally {
			rmSync(tempDir, {
				recursive: true,
				force: true
			});
		}
	});
});
