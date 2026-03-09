import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import {
	isIgnoredByDockerIgnore,
	readDockerIgnore
} from './helpers/dockerignore.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOCKERIGNORE = readDockerIgnore(ROOT);

describe('docker build context', () => {
	it('excludes non-runtime repository content from the build context', () => {
		assert.ok(
			isIgnoredByDockerIgnore(
				'tests/docker-build-context.test.ts',
				DOCKERIGNORE
			),
			'tests should stay out of the build context'
		);
		assert.ok(
			isIgnoredByDockerIgnore('docs/architecture.md', DOCKERIGNORE),
			'docs should stay out of the build context'
		);
		assert.ok(
			isIgnoredByDockerIgnore('audit/report.md', DOCKERIGNORE),
			'audit should stay out of the build context'
		);
		assert.ok(
			!isIgnoredByDockerIgnore(
				'apps/hub/src/routes/+layout.server.ts',
				DOCKERIGNORE
			),
			'runtime application code must remain in the build context'
		);
	});

	it('applies later negation rules after a path has been excluded', () => {
		const dockerignore = ['tests', '!tests/keep.txt'].join('\n');

		assert.ok(
			isIgnoredByDockerIgnore('tests/drop.txt', dockerignore),
			'later rules should not unignore unrelated files'
		);
		assert.ok(
			!isIgnoredByDockerIgnore('tests/keep.txt', dockerignore),
			'negated rules should restore included paths'
		);
	});
});
