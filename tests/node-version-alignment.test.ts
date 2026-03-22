import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
	assertSupportedNodeVersion,
	readPinnedNodeVersion
} from '../scripts/check-node-version.ts';
import {
	getLocalBuildContextCopySources,
	REQUIRED_DOCKER_BUILD_ROOT_SCRIPT_PATHS
} from './helpers/dockerfile.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const DOCKERFILE_PATH = path.join(ROOT, 'Dockerfile');
const DOCKERIGNORE_PATH = path.join(ROOT, '.dockerignore');
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json');
const HUB_PACKAGE_JSON_PATH = path.join(ROOT, 'apps', 'hub', 'package.json');
const PNPM_WORKSPACE_PATH = path.join(ROOT, 'pnpm-workspace.yaml');
const DOCKER_NODE_VERSION_PATTERN = /^FROM node:(\d+\.\d+\.\d+)-/m;

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeShellScript(value: string): string {
	return value
		.replace(/\\\s*\n/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function isBuildContextPathCopied(
	buildContextSources: ReadonlySet<string>,
	relativePath: string
): boolean {
	const parentDirectory = path.posix.dirname(relativePath);

	return (
		buildContextSources.has('.') ||
		buildContextSources.has(parentDirectory) ||
		buildContextSources.has(`${parentDirectory}/`) ||
		buildContextSources.has(relativePath)
	);
}

function readPinnedDockerNodeVersion(): string {
	const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
	const match = dockerfile.match(DOCKER_NODE_VERSION_PATTERN);
	assert.ok(match, 'Dockerfile should pin a Node runtime image');
	return match[1] ?? '';
}

function assertRunsNodePreflightFirst(
	scriptName: string,
	scriptValue: string | undefined,
	preflightScriptPath: string
): void {
	const firstCommand = normalizeShellScript(scriptValue ?? '')
		.split('&&')[0]
		?.trim();

	assert.ok(firstCommand, `${scriptName} should define a command`);
	assert.ok(
		firstCommand.includes('node:check') ||
			firstCommand.includes(preflightScriptPath),
		`${scriptName} should fail fast on unsupported Node.js versions`
	);
}

describe('node runtime version alignment', () => {
	it('pins package metadata to the Docker runtime patch version', () => {
		const pinnedNodeVersion = readPinnedDockerNodeVersion();
		const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
			packageManager?: unknown;
			engines?: {
				node?: unknown;
			};
		};

		assert.strictEqual(packageJson.engines?.node, pinnedNodeVersion);
		assert.match(
			String(packageJson.packageManager ?? ''),
			/^pnpm@\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/,
			'package.json should pin the pnpm package manager version'
		);
		assert.strictEqual(readPinnedNodeVersion(), pinnedNodeVersion);
		assert.doesNotThrow(() =>
			assertSupportedNodeVersion(`v${pinnedNodeVersion}`, pinnedNodeVersion)
		);
		assert.throws(
			() => assertSupportedNodeVersion('v22.22.1', pinnedNodeVersion),
			new RegExp(
				`Unsupported Node\\.js runtime: expected ${escapeRegExp(pinnedNodeVersion)}, received 22\\.22\\.1`
			)
		);
	});

	it('runs the shared runtime preflight before root build and test entrypoints', () => {
		const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
			scripts?: Record<string, string>;
		};
		const scripts = packageJson.scripts ?? {};

		assert.ok(
			(scripts['node:check'] ?? '').includes('scripts/check-node-version.ts'),
			'node:check should invoke the shared root Node.js preflight script'
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
			assertRunsNodePreflightFirst(
				scriptName,
				scripts[scriptName],
				'scripts/check-node-version.ts'
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

		assert.ok(
			(scripts['node:check'] ?? '').includes(
				'../../scripts/check-node-version.ts'
			),
			'hub node:check should invoke the shared root Node.js preflight script'
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
			assertRunsNodePreflightFirst(
				scriptName,
				scripts[scriptName],
				'../../scripts/check-node-version.ts'
			);
		}
	});

	it('copies the required shared build helpers into the Docker build stage', () => {
		const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
		const buildContextSources = new Set(
			getLocalBuildContextCopySources(dockerfile)
		);

		for (const requiredPath of REQUIRED_DOCKER_BUILD_ROOT_SCRIPT_PATHS) {
			assert.ok(
				isBuildContextPathCopied(buildContextSources, requiredPath),
				`Dockerfile should copy ${requiredPath} into the build context`
			);
		}
	});

	it('installs production dependencies without interactive pruning in Docker', () => {
		const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
		const workspaceConfig = readFileSync(PNPM_WORKSPACE_PATH, 'utf8');

		assert.doesNotMatch(
			dockerfile,
			/\bpnpm prune --prod\b/,
			'Dockerfile should not rely on interactive pnpm pruning in CI'
		);
		assert.match(
			dockerfile,
			/\bpnpm --filter @kaivalo\/hub deploy --prod \/out\b/,
			'Dockerfile should package the hub app with pnpm deploy'
		);
		assert.doesNotMatch(
			dockerfile,
			/COPY --from=.*\/app\/node_modules \.\/node_modules/,
			'Dockerfile should not copy a shared workspace node_modules tree into runtime'
		);
		assert.match(
			workspaceConfig,
			/^injectWorkspacePackages:\s*true$/m,
			'pnpm workspace config should enable injected workspace packages for deploy packaging'
		);
	});

	it('keeps the required shared build helpers in the Docker build context', () => {
		const dockerignore = readFileSync(DOCKERIGNORE_PATH, 'utf8');

		assert.match(
			dockerignore,
			/^scripts\/\*$/m,
			'.dockerignore should ignore root scripts by default'
		);
		for (const requiredPath of REQUIRED_DOCKER_BUILD_ROOT_SCRIPT_PATHS) {
			assert.match(
				dockerignore,
				new RegExp(`^!${escapeRegExp(requiredPath)}$`, 'm'),
				`.dockerignore should keep ${requiredPath} in the Docker build context`
			);
		}
	});
});
