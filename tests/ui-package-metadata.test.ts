import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const UI_PACKAGE_JSON_PATH = path.join(ROOT, 'packages', 'ui', 'package.json');

describe('@kaivalo/ui package metadata', () => {
	it('marks the workspace package private to avoid accidental publication', () => {
		const uiPackage = JSON.parse(readFileSync(UI_PACKAGE_JSON_PATH, 'utf8'));

		assert.strictEqual(uiPackage.private, true);
	});
});
