import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOCKERIGNORE_PATH = path.join(ROOT, '.dockerignore');

describe('docker build context', () => {
	it('excludes non-runtime repository content from the build context', () => {
		const dockerignore = readFileSync(DOCKERIGNORE_PATH, 'utf8');
		const entries = new Set(
			dockerignore
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line && !line.startsWith('#'))
		);

		assert.ok(
			entries.has('tests'),
			'tests should stay out of the build context'
		);
		assert.ok(entries.has('docs'), 'docs should stay out of the build context');
		assert.ok(
			entries.has('audit'),
			'audit should stay out of the build context'
		);
	});
});
