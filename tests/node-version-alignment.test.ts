import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOCKERFILE_PATH = path.join(ROOT, 'Dockerfile');
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json');
const PACKAGE_LOCK_PATH = path.join(ROOT, 'package-lock.json');
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
	});
});
