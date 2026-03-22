import { appendFileSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import { parse } from 'yaml';
import {
	collectAuditAdvisories,
	findUnallowlistedAdvisories,
	readAllowlist,
	runAudit
} from './check-pnpm-audit.ts';
import { isExecutedDirectly } from './is-executed-directly.ts';

const ROOT = resolve(import.meta.dirname, '..');
const LOCKFILE_PATH = resolve(ROOT, 'pnpm-lock.yaml');
const PACKAGE_JSON_PATH = resolve(ROOT, 'package.json');
const OUTDATED_COMMAND_ARGS = ['outdated', '-r', '--format', 'json'];
const OUTDATED_TIMEOUT_MS = 90_000;
const ISSUE_TITLE = 'Review weekly dependency maintenance';
const SVELTEKIT_REGISTRY_LATEST_URL =
	'https://registry.npmjs.org/@sveltejs%2fkit/latest';
export const FETCH_TIMEOUT_MS = 10_000;
export const FETCH_MAX_ATTEMPTS = 3;
export const FETCH_RETRY_DELAY_MS = 1_000;
const REGISTRY_METADATA_PARSE_ERROR_PREFIX =
	'Failed to parse latest @sveltejs/kit metadata';
const REGISTRY_METADATA_VALIDATION_ERROR_MESSAGE = `${REGISTRY_METADATA_PARSE_ERROR_PREFIX}: expected a valid semver version string`;
const RETRYABLE_FETCH_ERROR_CODES = new Set([
	'ETIMEDOUT',
	'EAI_AGAIN',
	'ENOTFOUND',
	'ECONNRESET',
	'ECONNREFUSED',
	'EHOSTUNREACH',
	'ENETUNREACH',
	'ERR_SOCKET_TIMEOUT'
]);
const RETRYABLE_FETCH_STATUSES = new Set([429, 500, 502, 503, 504]);

type DependentPackage = {
	name: string;
	location: string;
};

type OutdatedDependency = {
	current: string;
	latest: string;
	wanted: string;
	isDeprecated: boolean;
	dependencyType: string;
	dependentPackages: DependentPackage[];
};

type OutdatedDependencyMap = Record<string, OutdatedDependency>;

type WorkspaceOutdatedDependency = {
	name: string;
	current: string;
	latest: string;
	wanted: string;
	dependencyType: string;
	isDeprecated: boolean;
};

type WorkspaceOutdatedGroup = {
	name: string;
	location: string;
	dependencies: WorkspaceOutdatedDependency[];
};

type PnpmOverride = {
	name: string;
	value: string;
};

type LatestSvelteKitMetadata = {
	version: string;
	cookieRange: string;
};

type ReadLatestSvelteKitMetadataOptions = {
	fetchImpl?: typeof fetch;
	maxAttempts?: number;
	retryDelayMs?: number;
	sleepImpl?: (delayMs: number) => Promise<void>;
};

type RegistryFetchError = Error & {
	code?: string;
	cause?: unknown;
	status?: number;
};

type SvelteKitUpstreamStatus = {
	currentVersion: string;
	latestVersion: string;
	latestCookieRange: string;
	hasNewerUpstream: boolean;
};

type DependencySweepResult = {
	readonly issueTitle: string;
	readonly workspaceGroups: WorkspaceOutdatedGroup[];
	readonly directDependencyCount: number;
	readonly allAuditAdvisories: ReturnType<typeof collectAuditAdvisories>;
	readonly unallowlistedAdvisories: ReturnType<
		typeof findUnallowlistedAdvisories
	>;
	readonly allowlistEntries: ReturnType<typeof readAllowlist>;
	readonly overrides: PnpmOverride[];
	readonly svelteKitUpstream: SvelteKitUpstreamStatus;
	readonly hasItemsToReview: boolean;
};

type RunOutdatedDependencies = {
	spawnSyncImpl?: typeof spawnSync;
	timeoutMs?: number;
};

function parseArgs(argv: readonly string[]) {
	const options = {
		writeGithubOutput: false
	};

	for (const arg of argv) {
		if (arg === '--github-output') {
			options.writeGithubOutput = true;
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return options;
}

export function parseOutdatedReport(output: string): OutdatedDependencyMap {
	const trimmed = output.trim();
	if (trimmed === '') {
		return {};
	}

	const parsed = JSON.parse(trimmed) as unknown;
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('pnpm outdated did not return an object report');
	}

	return parsed as OutdatedDependencyMap;
}

export function runOutdated({
	spawnSyncImpl = spawnSync,
	timeoutMs = OUTDATED_TIMEOUT_MS
}: RunOutdatedDependencies = {}): OutdatedDependencyMap {
	const outdatedResult = spawnSyncImpl('pnpm', OUTDATED_COMMAND_ARGS, {
		cwd: ROOT,
		encoding: 'utf8',
		timeout: timeoutMs
	});

	if (outdatedResult.error) {
		throw new Error(`pnpm outdated failed: ${outdatedResult.error.message}`, {
			cause: outdatedResult.error
		});
	}

	if (outdatedResult.status !== 0 && outdatedResult.status !== 1) {
		const stderr = outdatedResult.stderr?.trim();
		throw new Error(
			stderr
				? `pnpm outdated failed: ${stderr}`
				: `pnpm outdated failed with exit status ${outdatedResult.status}`
		);
	}

	return parseOutdatedReport(outdatedResult.stdout ?? '');
}

function getRelativeWorkspaceLocation(location: string): string {
	const relativeLocation = relative(ROOT, location);
	return relativeLocation === '' ? '.' : relativeLocation;
}

export function groupOutdatedDependenciesByWorkspace(
	outdatedDependencies: OutdatedDependencyMap
): WorkspaceOutdatedGroup[] {
	const grouped = new Map<string, WorkspaceOutdatedGroup>();

	for (const [dependencyName, dependency] of Object.entries(
		outdatedDependencies
	)) {
		for (const dependentPackage of dependency.dependentPackages) {
			const location = getRelativeWorkspaceLocation(dependentPackage.location);
			const groupKey = `${dependentPackage.name}:${location}`;
			const existingGroup = grouped.get(groupKey) ?? {
				name: dependentPackage.name,
				location,
				dependencies: []
			};

			existingGroup.dependencies.push({
				name: dependencyName,
				current: dependency.current,
				latest: dependency.latest,
				wanted: dependency.wanted,
				dependencyType: dependency.dependencyType,
				isDeprecated: dependency.isDeprecated
			});
			grouped.set(groupKey, existingGroup);
		}
	}

	return Array.from(grouped.values())
		.map((group) => ({
			...group,
			dependencies: group.dependencies.toSorted((left, right) =>
				left.name.localeCompare(right.name)
			)
		}))
		.toSorted((left, right) =>
			left.location === right.location
				? left.name.localeCompare(right.name)
				: left.location.localeCompare(right.location)
		);
}

export function readPnpmOverrides(
	packageJsonPath = PACKAGE_JSON_PATH
): PnpmOverride[] {
	const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
		pnpm?: {
			overrides?: Record<string, string>;
		};
	};

	return Object.entries(packageJson.pnpm?.overrides ?? {})
		.map(([name, value]) => ({ name, value }))
		.toSorted((left, right) => left.name.localeCompare(right.name));
}

function parseVersion(version: string) {
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

function isValidSemverVersion(version: string): boolean {
	try {
		parseVersion(version);
		return true;
	} catch {
		return false;
	}
}

function compareIdentifiers(left: string, right: string): number {
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

function compareVersions(leftVersion: string, rightVersion: string): number {
	const left = parseVersion(leftVersion);
	const right = parseVersion(rightVersion);

	for (const key of ['major', 'minor', 'patch'] as const) {
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

function readLockedDependencyVersion(
	entry:
		| {
				version?: unknown;
		  }
		| string
		| undefined
): string | null {
	const rawVersion =
		typeof entry === 'string'
			? entry
			: typeof entry?.version === 'string'
				? entry.version
				: '';
	const match = rawVersion.match(
		/^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:$|\()/
	);

	return match?.[1] ?? null;
}

export function readCurrentSvelteKitVersion(
	lockfilePath = LOCKFILE_PATH
): string {
	const lockfile = parse(readFileSync(lockfilePath, 'utf8')) as {
		importers?: {
			[importerPath: string]: {
				dependencies?: Record<
					string,
					{ version?: unknown } | string | undefined
				>;
				devDependencies?: Record<
					string,
					{ version?: unknown } | string | undefined
				>;
			};
		};
	};
	const hubImporter = lockfile?.importers?.['apps/hub'];
	const currentVersion = readLockedDependencyVersion(
		hubImporter?.dependencies?.['@sveltejs/kit'] ??
			hubImporter?.devDependencies?.['@sveltejs/kit']
	);
	if (!currentVersion) {
		throw new Error(
			'Could not find resolved @sveltejs/kit version in pnpm-lock.yaml'
		);
	}

	return currentVersion;
}

function createMetadataParseError(detail: string, cause?: unknown): Error {
	return cause === undefined
		? new Error(`${REGISTRY_METADATA_PARSE_ERROR_PREFIX}: ${detail}`)
		: new Error(`${REGISTRY_METADATA_PARSE_ERROR_PREFIX}: ${detail}`, {
				cause
			});
}

export function createFetchErrorMessage(error: unknown): string {
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

function createRegistryHttpError(status: number, statusText: string): Error {
	const error = new Error(
		`Failed to fetch latest @sveltejs/kit metadata: ${status} ${statusText}`
	) as RegistryFetchError;
	error.status = status;
	return error;
}

function isRetryableDomException(error: unknown): boolean {
	return (
		error instanceof DOMException &&
		(error.name === 'TimeoutError' || error.name === 'AbortError')
	);
}

function readFetchErrorCode(error: unknown): string {
	if (!error || typeof error !== 'object') {
		return '';
	}

	const record = error as { code?: unknown; cause?: unknown };
	if (typeof record.code === 'string') {
		return record.code.trim().toUpperCase();
	}

	if (
		record.cause &&
		typeof record.cause === 'object' &&
		'code' in record.cause &&
		typeof record.cause.code === 'string'
	) {
		return record.cause.code.trim().toUpperCase();
	}

	return '';
}

function isRetryableFetchError(error: unknown): boolean {
	if (isRetryableDomException(error)) {
		return true;
	}

	if (
		error &&
		typeof error === 'object' &&
		'status' in error &&
		typeof error.status === 'number'
	) {
		return RETRYABLE_FETCH_STATUSES.has(error.status);
	}

	if (
		error &&
		typeof error === 'object' &&
		'cause' in error &&
		isRetryableDomException(error.cause)
	) {
		return true;
	}

	const errorCode = readFetchErrorCode(error);
	return errorCode !== '' && RETRYABLE_FETCH_ERROR_CODES.has(errorCode);
}

function sleep(delayMs: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, delayMs);
	});
}

async function fetchLatestSvelteKitMetadata(
	fetchImpl: typeof fetch
): Promise<LatestSvelteKitMetadata> {
	let response;
	try {
		response = await fetchImpl(SVELTEKIT_REGISTRY_LATEST_URL, {
			headers: {
				accept: 'application/json'
			},
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
		});
	} catch (error) {
		throw new Error(createFetchErrorMessage(error), { cause: error });
	}

	if (!response.ok) {
		throw createRegistryHttpError(response.status, response.statusText);
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

export async function readLatestSvelteKitMetadata({
	fetchImpl = fetch,
	maxAttempts = FETCH_MAX_ATTEMPTS,
	retryDelayMs = FETCH_RETRY_DELAY_MS,
	sleepImpl = sleep
}: ReadLatestSvelteKitMetadataOptions = {}): Promise<LatestSvelteKitMetadata> {
	if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
		throw new Error('maxAttempts must be a positive integer');
	}
	if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0) {
		throw new Error('retryDelayMs must be a non-negative integer');
	}

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			return await fetchLatestSvelteKitMetadata(fetchImpl);
		} catch (error) {
			if (attempt === maxAttempts || !isRetryableFetchError(error)) {
				throw error;
			}

			await sleepImpl(retryDelayMs * attempt);
		}
	}

	throw new Error('Failed to fetch latest @sveltejs/kit metadata');
}

export async function readSvelteKitUpstreamStatus(): Promise<SvelteKitUpstreamStatus> {
	const currentVersion = readCurrentSvelteKitVersion();
	const latestMetadata = await readLatestSvelteKitMetadata();

	return {
		currentVersion,
		latestVersion: latestMetadata.version,
		latestCookieRange: latestMetadata.cookieRange,
		hasNewerUpstream:
			compareVersions(latestMetadata.version, currentVersion) > 0
	};
}

export function buildDependencySweepResult({
	outdatedDependencies,
	auditAdvisories,
	allowlistEntries,
	overrides,
	svelteKitUpstream
}: {
	outdatedDependencies: OutdatedDependencyMap;
	auditAdvisories: ReturnType<typeof collectAuditAdvisories>;
	allowlistEntries: ReturnType<typeof readAllowlist>;
	overrides: PnpmOverride[];
	svelteKitUpstream: SvelteKitUpstreamStatus;
}): DependencySweepResult {
	const workspaceGroups =
		groupOutdatedDependenciesByWorkspace(outdatedDependencies);
	const unallowlistedAdvisories = findUnallowlistedAdvisories(
		auditAdvisories,
		allowlistEntries
	);
	const directDependencyCount = workspaceGroups.reduce(
		(total, group) => total + group.dependencies.length,
		0
	);

	return {
		issueTitle: ISSUE_TITLE,
		workspaceGroups,
		directDependencyCount,
		allAuditAdvisories: auditAdvisories,
		unallowlistedAdvisories,
		allowlistEntries,
		overrides,
		svelteKitUpstream,
		hasItemsToReview:
			directDependencyCount > 0 ||
			unallowlistedAdvisories.length > 0 ||
			svelteKitUpstream.hasNewerUpstream
	};
}

export async function runDependencySweep(): Promise<DependencySweepResult> {
	return buildDependencySweepResult({
		outdatedDependencies: runOutdated(),
		auditAdvisories: collectAuditAdvisories(runAudit()),
		allowlistEntries: readAllowlist(),
		overrides: readPnpmOverrides(),
		svelteKitUpstream: await readSvelteKitUpstreamStatus()
	});
}

export function buildSummary(result: DependencySweepResult): string {
	return [
		'Weekly dependency maintenance summary',
		'',
		`- Direct dependency updates requiring review: ${result.directDependencyCount}`,
		`- Unallowlisted audit advisories requiring review: ${result.unallowlistedAdvisories.length}`,
		`- Allowlisted audit advisories currently tracked: ${
			result.allAuditAdvisories.length - result.unallowlistedAdvisories.length
		}`,
		`- Active pnpm overrides: ${result.overrides.length}`,
		`- Current resolved @sveltejs/kit version: ${result.svelteKitUpstream.currentVersion}`,
		`- Latest published @sveltejs/kit version: ${result.svelteKitUpstream.latestVersion}`,
		`- Latest upstream cookie range: ${result.svelteKitUpstream.latestCookieRange}`,
		`- Newer @sveltejs/kit upstream available: ${
			result.svelteKitUpstream.hasNewerUpstream ? 'yes' : 'no'
		}`,
		result.hasItemsToReview
			? '- Status: review recommended'
			: '- Status: no dependency review required'
	].join('\n');
}

function formatOutdatedDependency(
	dependency: WorkspaceOutdatedDependency
): string {
	const deprecatedSuffix = dependency.isDeprecated ? ' [deprecated]' : '';
	return `- ${dependency.name} (${dependency.dependencyType}): ${dependency.current} -> ${dependency.latest} (wanted ${dependency.wanted})${deprecatedSuffix}`;
}

function formatAuditAdvisory(
	advisory: DependencySweepResult['allAuditAdvisories'][number]
): string {
	const location = advisory.path ? ` at ${advisory.path}` : '';
	return `- ${advisory.package} (${advisory.severity}) source ${advisory.source}${location}: ${advisory.title}`;
}

function formatAllowlistEntry(
	entry: DependencySweepResult['allowlistEntries'][number]
): string {
	const pathSuffix = entry.path ? ` at ${entry.path}` : '';
	const reasonSuffix = entry.reason ? ` — ${entry.reason}` : '';
	return `- ${entry.package} (${entry.severity}) source ${entry.source}${pathSuffix}: ${entry.title}${reasonSuffix}`;
}

function formatOverride(override: PnpmOverride): string {
	return `- ${override.name}: ${override.value}`;
}

export function buildIssueBody(result: DependencySweepResult): string {
	const sections = [
		'# Dependency Maintenance Review',
		'',
		`- Direct dependency updates requiring review: ${result.directDependencyCount}`,
		`- Unallowlisted audit advisories requiring review: ${result.unallowlistedAdvisories.length}`,
		`- Allowlisted audit advisories currently tracked: ${
			result.allAuditAdvisories.length - result.unallowlistedAdvisories.length
		}`,
		`- Active pnpm overrides: ${result.overrides.length}`,
		`- Newer @sveltejs/kit upstream available: ${
			result.svelteKitUpstream.hasNewerUpstream ? 'yes' : 'no'
		}`,
		''
	];

	sections.push('## Direct dependency updates');
	if (result.workspaceGroups.length === 0) {
		sections.push(
			'',
			'No direct dependency updates currently require review.',
			''
		);
	} else {
		for (const group of result.workspaceGroups) {
			sections.push('', `### ${group.name} (${group.location})`);
			for (const dependency of group.dependencies) {
				sections.push(formatOutdatedDependency(dependency));
			}
		}
		sections.push('');
	}

	sections.push('## Audit advisories requiring review');
	if (result.unallowlistedAdvisories.length === 0) {
		sections.push(
			'',
			'No unallowlisted audit advisories currently require review.',
			''
		);
	} else {
		sections.push(
			'',
			...result.unallowlistedAdvisories.map(formatAuditAdvisory),
			''
		);
	}

	sections.push('## SvelteKit upstream review');
	if (result.svelteKitUpstream.hasNewerUpstream) {
		sections.push(
			'',
			'A newer `@sveltejs/kit` release is available than the one currently resolved in this repository.',
			`- Current resolved repo version: \`${result.svelteKitUpstream.currentVersion}\``,
			`- Latest published upstream version: \`${result.svelteKitUpstream.latestVersion}\``,
			`- Latest upstream \`cookie\` dependency range: \`${result.svelteKitUpstream.latestCookieRange}\``,
			'- Cookie advisory exception: `audit/risks/pnpm-lock.md`',
			''
		);
	} else {
		sections.push(
			'',
			'The repository already resolves the latest published `@sveltejs/kit` release.',
			`- Current resolved repo version: \`${result.svelteKitUpstream.currentVersion}\``,
			`- Latest published upstream version: \`${result.svelteKitUpstream.latestVersion}\``,
			`- Latest upstream \`cookie\` dependency range: \`${result.svelteKitUpstream.latestCookieRange}\``,
			''
		);
	}

	sections.push('## Active audit allowlist entries');
	if (result.allowlistEntries.length === 0) {
		sections.push('', 'No audit allowlist entries are configured.', '');
	} else {
		sections.push('', ...result.allowlistEntries.map(formatAllowlistEntry), '');
	}

	sections.push('## Active pnpm overrides');
	if (result.overrides.length === 0) {
		sections.push('', 'No pnpm overrides are configured.', '');
	} else {
		sections.push('', ...result.overrides.map(formatOverride), '');
	}

	sections.push(
		'This issue is maintained by the scheduled dependency sweep workflow. It should stay open only while direct dependency updates, unallowlisted advisories, or newer upstream `@sveltejs/kit` releases require review.'
	);

	return sections.join('\n');
}

function escapeMultilineValue(value: string): string {
	return value.replace(/\r/g, '');
}

export function createGithubOutputDelimiter(
	value: string,
	createToken: () => string = randomUUID
): string {
	const normalizedValue = escapeMultilineValue(value);

	for (;;) {
		const delimiter = `kaivalo_output_${createToken()}`;
		if (!normalizedValue.includes(delimiter)) {
			return delimiter;
		}
	}
}

function formatGithubOutputValue(
	name: string,
	value: string,
	createToken: () => string
): string {
	const normalizedValue = escapeMultilineValue(value);
	if (!normalizedValue.includes('\n')) {
		return `${name}=${normalizedValue}`;
	}

	const delimiter = createGithubOutputDelimiter(normalizedValue, createToken);
	return `${name}<<${delimiter}\n${normalizedValue}\n${delimiter}`;
}

export function formatGithubOutputEntries(
	result: DependencySweepResult,
	createToken: () => string = randomUUID
): string[] {
	return [
		formatGithubOutputValue(
			'has_items_to_review',
			String(result.hasItemsToReview),
			createToken
		),
		formatGithubOutputValue(
			'has_newer_sveltekit_upstream',
			String(result.svelteKitUpstream.hasNewerUpstream),
			createToken
		),
		formatGithubOutputValue(
			'current_sveltekit_version',
			result.svelteKitUpstream.currentVersion,
			createToken
		),
		formatGithubOutputValue(
			'latest_sveltekit_version',
			result.svelteKitUpstream.latestVersion,
			createToken
		),
		formatGithubOutputValue(
			'latest_sveltekit_cookie_range',
			result.svelteKitUpstream.latestCookieRange,
			createToken
		),
		formatGithubOutputValue('issue_title', result.issueTitle, createToken),
		formatGithubOutputValue('summary', buildSummary(result), createToken),
		formatGithubOutputValue('issue_body', buildIssueBody(result), createToken)
	];
}

export async function main(
	argv = process.argv.slice(2)
): Promise<DependencySweepResult> {
	const options = parseArgs(argv);
	const result = await runDependencySweep();

	if (options.writeGithubOutput) {
		const outputPath = process.env.GITHUB_OUTPUT;
		if (!outputPath) {
			throw new Error('GITHUB_OUTPUT is required when using --github-output');
		}

		appendFileSync(
			outputPath,
			`${formatGithubOutputEntries(result).join('\n')}\n`
		);
		return result;
	}

	console.log(buildSummary(result));
	return result;
}

export async function runCli() {
	try {
		await main();
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: 'Dependency sweep failed unexpectedly';
		console.error(message);
		process.exitCode = 1;
	}
}

if (isExecutedDirectly(import.meta.url)) {
	void runCli();
}
