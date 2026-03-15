import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

function isIgnored(path) {
	try {
		execFileSync('git', ['check-ignore', path], {
			cwd: rootDir,
			stdio: 'pipe',
			encoding: 'utf8'
		});
		return true;
	} catch (error) {
		if (
			error &&
			typeof error === 'object' &&
			'code' in error &&
			error.code === 'EPERM' &&
			'status' in error &&
			error.status === 0
		) {
			return true;
		}
		if (
			error &&
			typeof error === 'object' &&
			'status' in error &&
			error.status === 1
		) {
			return false;
		}
		throw error;
	}
}

function assertIgnored(path) {
	assert.strictEqual(
		isIgnored(path),
		true,
		`expected ${path} to be ignored by git check-ignore`
	);
}

function assertNotIgnored(path) {
	assert.strictEqual(
		isIgnored(path),
		false,
		`expected ${path} to remain tracked by git`
	);
}

describe('git ignore behavior', () => {
	it('ignores local build and environment artifact paths', () => {
		assertIgnored('packages/ui/node_modules/foo');
		assertIgnored('.env');
		assertIgnored('apps/hub/build/server-output.js');
		assertIgnored('apps/hub/.svelte-kit/generated/server/internal.js');
	});

	it('keeps committed templates trackable', () => {
		assertNotIgnored('.env.example');
		assertNotIgnored('apps/hub/.env.example');
	});
});
