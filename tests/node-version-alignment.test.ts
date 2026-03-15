import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
	assertSupportedNodeVersion,
	readPinnedNodeVersion
} from '../scripts/check-node-version.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOCKERFILE_PATH = path.join(ROOT, 'Dockerfile');
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json');
const PACKAGE_LOCK_PATH = path.join(ROOT, 'package-lock.json');
const HUB_PACKAGE_JSON_PATH = path.join(ROOT, 'apps', 'hub', 'package.json');
const DOCKER_NODE_VERSION_PATTERN = /^FROM node:(\d+\.\d+\.\d+)-/m;

function readPinnedDockerNodeVersion(): string {
	const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
	const match = dockerfile.match(DOCKER_NODE_VERSION_PATTERN);
	assert.ok(match, 'Dockerfile should pin a Node runtime image');
	return match[1] ?? '';
}

describe('node runtime version alignment', () => {
	it('pins package metadata to the Docker runtime patch version', () => {
		const pinnedNodeVersion = readPinnedDockerNodeVersion();
		const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
			engines?: {
				node?: unknown;
			};
		};
		const packageLock = JSON.parse(readFileSync(PACKAGE_LOCK_PATH, 'utf8')) as {
			packages?: {
				'': {
					engines?: {
						node?: unknown;
					};
				};
			};
		};

		assert.strictEqual(packageJson.engines?.node, pinnedNodeVersion);
		assert.strictEqual(
			packageLock.packages?.['']?.engines?.node,
			pinnedNodeVersion
		);
		assert.strictEqual(readPinnedNodeVersion(), pinnedNodeVersion);
		assert.doesNotThrow(() =>
			assertSupportedNodeVersion(`v${pinnedNodeVersion}`, pinnedNodeVersion)
		);
		assert.throws(
			() => assertSupportedNodeVersion('v22.22.1', pinnedNodeVersion),
			/Unsupported Node\.js runtime: expected 24\.14\.0, received 22\.22\.1/
		);
	});

	it('runs the shared runtime preflight before root build and test entrypoints', () => {
		const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
			scripts?: Record<string, string>;
		};
		const scripts = packageJson.scripts ?? {};

		assert.strictEqual(
			scripts['node:check'],
			'node scripts/check-node-version.ts'
		);
		for (const scriptName of [
			'check',
			'audit:deps',
			'test:fast',
			'test:core',
			'test:build:hub',
			'test:preview:hub',
			'test:production',
			'test:integration'
		]) {
			assert.match(
				scripts[scriptName] ?? '',
				/^npm run node:check && /,
				`${scriptName} should fail fast on unsupported Node.js versions`
			);
		}
	});

	it('runs the shared runtime preflight before hub build and test entrypoints', () => {
		const packageJson = JSON.parse(
			readFileSync(HUB_PACKAGE_JSON_PATH, 'utf8')
		) as {
			scripts?: Record<string, string>;
		};
		const scripts = packageJson.scripts ?? {};

		assert.strictEqual(
			scripts['node:check'],
			'node ../../scripts/check-node-version.ts'
		);
		for (const scriptName of [
			'build',
			'preview',
			'check',
			'check:watch',
			'pretest',
			'test:unit',
			'test:build'
		]) {
			assert.match(
				scripts[scriptName] ?? '',
				/^npm run node:check && /,
				`${scriptName} should fail fast on unsupported Node.js versions`
			);
		}
	});
});
