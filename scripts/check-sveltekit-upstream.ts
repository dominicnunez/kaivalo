import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const REPO_ROOT = resolve(import.meta.dirname, '..');
const LOCKFILE_PATH = resolve(REPO_ROOT, 'package-lock.json');
const ISSUE_TITLE = 'Track upstream @sveltejs/kit updates for cookie advisory';
const REGISTRY_LATEST_URL = 'https://registry.npmjs.org/@sveltejs%2fkit/latest';
export const FETCH_TIMEOUT_MS = 10_000;
const REGISTRY_METADATA_PARSE_ERROR_PREFIX =
	'Failed to parse latest @sveltejs/kit metadata';
const REGISTRY_METADATA_VALIDATION_ERROR_MESSAGE = `${REGISTRY_METADATA_PARSE_ERROR_PREFIX}: expected a valid semver version string`;

function createMetadataParseError(detail, cause) {
	return cause === undefined
		? new Error(`${REGISTRY_METADATA_PARSE_ERROR_PREFIX}: ${detail}`)
		: new Error(`${REGISTRY_METADATA_PARSE_ERROR_PREFIX}: ${detail}`, {
				cause
			});
}

function parseArgs(argv) {
	const options = {
		writeGithubOutput: false
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === '--github-output') {
			options.writeGithubOutput = true;
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return options;
}

function parseVersion(version) {
	const match = String(version)
		.trim()
		.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
	if (!match) {
		throw new Error(`Invalid semver version: ${version}`);
	}

	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease: match[4] ? match[4].split('.') : []
	};
}

function isValidSemverVersion(version) {
	try {
		parseVersion(version);
		return true;
	} catch {
		return false;
	}
}

function compareIdentifiers(left, right) {
	const leftIsNumeric = /^\d+$/.test(left);
	const rightIsNumeric = /^\d+$/.test(right);

	if (leftIsNumeric && rightIsNumeric) {
		return Number(left) - Number(right);
	}

	if (leftIsNumeric) {
		return -1;
	}

	if (rightIsNumeric) {
		return 1;
	}

	return left.localeCompare(right);
}

function compareVersions(leftVersion, rightVersion) {
	const left = parseVersion(leftVersion);
	const right = parseVersion(rightVersion);

	for (const key of ['major', 'minor', 'patch']) {
		if (left[key] !== right[key]) {
			return left[key] - right[key];
		}
	}

	if (left.prerelease.length === 0 && right.prerelease.length === 0) {
		return 0;
	}

	if (left.prerelease.length === 0) {
		return 1;
	}

	if (right.prerelease.length === 0) {
		return -1;
	}

	const maxLength = Math.max(left.prerelease.length, right.prerelease.length);
	for (let index = 0; index < maxLength; index += 1) {
		const leftIdentifier = left.prerelease[index];
		const rightIdentifier = right.prerelease[index];

		if (leftIdentifier === undefined) {
			return -1;
		}

		if (rightIdentifier === undefined) {
			return 1;
		}

		const comparison = compareIdentifiers(leftIdentifier, rightIdentifier);
		if (comparison !== 0) {
			return comparison;
		}
	}

	return 0;
}

function escapeMultilineValue(value) {
	return String(value).replace(/\r/g, '');
}

export function createGithubOutputDelimiter(value, createToken = randomUUID) {
	const normalizedValue = escapeMultilineValue(value);

	for (;;) {
		const delimiter = `kaivalo_output_${createToken()}`;
		if (!normalizedValue.includes(delimiter)) {
			return delimiter;
		}
	}
}

function formatGithubOutputValue(name, value, createToken) {
	const normalizedValue = escapeMultilineValue(value);
	if (!normalizedValue.includes('\n')) {
		return `${name}=${normalizedValue}`;
	}

	const delimiter = createGithubOutputDelimiter(normalizedValue, createToken);
	return `${name}<<${delimiter}\n${normalizedValue}\n${delimiter}`;
}

export function formatGithubOutputEntries(result, createToken = randomUUID) {
	return [
		formatGithubOutputValue(
			'current_version',
			result.currentVersion,
			createToken
		),
		formatGithubOutputValue(
			'latest_version',
			result.latestVersion,
			createToken
		),
		formatGithubOutputValue(
			'latest_cookie_range',
			result.latestCookieRange,
			createToken
		),
		formatGithubOutputValue(
			'has_newer_upstream',
			String(result.hasNewerUpstream),
			createToken
		),
		formatGithubOutputValue('issue_title', result.issueTitle, createToken),
		formatGithubOutputValue('summary', buildSummary(result), createToken),
		formatGithubOutputValue('issue_body', buildIssueBody(result), createToken)
	];
}

export async function readCurrentVersion(lockfilePath = LOCKFILE_PATH) {
	const raw = await readFile(lockfilePath, 'utf8');
	const lockfile = JSON.parse(raw);
	const currentVersion =
		lockfile?.packages?.['node_modules/@sveltejs/kit']?.version;
	if (!currentVersion) {
		throw new Error(
			'Could not find resolved @sveltejs/kit version in package-lock.json'
		);
	}
	return currentVersion;
}

export function createFetchErrorMessage(error) {
	if (
		error instanceof DOMException &&
		(error.name === 'TimeoutError' || error.name === 'AbortError')
	) {
		return `Timed out fetching latest @sveltejs/kit metadata after ${FETCH_TIMEOUT_MS}ms`;
	}

	const message =
		error instanceof Error && error.message ? error.message : String(error);
	return `Failed to fetch latest @sveltejs/kit metadata: ${message}`;
}

export async function readLatestMetadata({ fetchImpl = fetch } = {}) {
	let response;
	try {
		response = await fetchImpl(REGISTRY_LATEST_URL, {
			headers: {
				accept: 'application/json'
			},
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
		});
	} catch (error) {
		throw new Error(createFetchErrorMessage(error), { cause: error });
	}

	if (!response.ok) {
		throw new Error(
			`Failed to fetch latest @sveltejs/kit metadata: ${response.status} ${response.statusText}`
		);
	}

	let latestMetadata;
	try {
		latestMetadata = await response.json();
	} catch (error) {
		const message =
			error instanceof Error && error.message ? error.message : String(error);
		throw createMetadataParseError(message, error);
	}

	if (!isValidSemverVersion(latestMetadata?.version)) {
		throw new Error(REGISTRY_METADATA_VALIDATION_ERROR_MESSAGE);
	}

	return {
		version: latestMetadata.version,
		cookieRange:
			typeof latestMetadata?.dependencies?.cookie === 'string'
				? latestMetadata.dependencies.cookie
				: 'not declared'
	};
}

function buildSummary(result) {
	const lines = [
		'# Upstream SvelteKit Check',
		'',
		`- Current resolved version: \`${result.currentVersion}\``,
		`- Latest published version: \`${result.latestVersion}\``,
		`- Latest upstream cookie range: \`${result.latestCookieRange}\``,
		`- Newer upstream available: \`${result.hasNewerUpstream ? 'yes' : 'no'}\``
	];

	if (result.hasNewerUpstream) {
		lines.push(
			'',
			'A newer upstream `@sveltejs/kit` release exists and should be reviewed.'
		);
	} else {
		lines.push(
			'',
			'The repository is already on the latest published `@sveltejs/kit` release.'
		);
	}

	return lines.join('\n');
}

function buildIssueBody(result) {
	return [
		'## Upstream review needed',
		'',
		'A newer `@sveltejs/kit` release is available than the one currently resolved in this repository.',
		'',
		`- Current resolved repo version: \`${result.currentVersion}\``,
		`- Latest published upstream version: \`${result.latestVersion}\``,
		`- Latest upstream \`cookie\` dependency range: \`${result.latestCookieRange}\``,
		'- Cookie advisory exception: `audit/exceptions/risks.md`',
		'',
		'This issue exists because upstream advanced. Review the new release and decide whether to update the app, even if the cookie advisory may still be unresolved.'
	].join('\n');
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const currentVersion = await readCurrentVersion();
	const latestMetadata = await readLatestMetadata();
	const hasNewerUpstream =
		compareVersions(latestMetadata.version, currentVersion) > 0;
	const result = {
		currentVersion,
		latestVersion: latestMetadata.version,
		latestCookieRange: latestMetadata.cookieRange,
		hasNewerUpstream,
		issueTitle: ISSUE_TITLE
	};

	if (options.writeGithubOutput) {
		const githubOutputPath = process.env.GITHUB_OUTPUT;
		if (!githubOutputPath) {
			throw new Error('GITHUB_OUTPUT is required when using --github-output');
		}

		const { appendFile } = await import('node:fs/promises');
		await appendFile(
			githubOutputPath,
			`${formatGithubOutputEntries(result).join('\n')}\n`
		);
	}

	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
