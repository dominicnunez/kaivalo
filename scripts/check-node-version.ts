import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json');

type RootPackageJson = {
	engines?: {
		node?: unknown;
	};
};

function normalizeNodeVersion(version: string): string {
	return version.trim().replace(/^v/, '');
}

export function readPinnedNodeVersion(
	packageJsonPath = PACKAGE_JSON_PATH
): string {
	const packageJson = JSON.parse(
		readFileSync(packageJsonPath, 'utf8')
	) as RootPackageJson;
	const pinnedVersion =
		typeof packageJson.engines?.node === 'string'
			? normalizeNodeVersion(packageJson.engines.node)
			: '';

	if (!pinnedVersion) {
		throw new Error('package.json must declare engines.node');
	}

	return pinnedVersion;
}

export function assertSupportedNodeVersion(
	currentVersion = process.version,
	expectedVersion = readPinnedNodeVersion()
): void {
	const actualVersion = normalizeNodeVersion(currentVersion);
	const normalizedExpectedVersion = normalizeNodeVersion(expectedVersion);

	if (actualVersion === normalizedExpectedVersion) {
		return;
	}

	throw new Error(
		`Unsupported Node.js runtime: expected ${normalizedExpectedVersion}, received ${actualVersion}. Install and use Node.js ${normalizedExpectedVersion} before running build or test commands.`
	);
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file://').href) {
	assertSupportedNodeVersion();
}
