import { appendFileSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import {
	collectAuditAdvisories,
	findUnallowlistedAdvisories,
	readAllowlist,
	runAudit
} from './check-pnpm-audit.ts';
import { isExecutedDirectly } from './is-executed-directly.ts';

const ROOT = resolve(import.meta.dirname, '..');
const PACKAGE_JSON_PATH = resolve(ROOT, 'package.json');
const OUTDATED_COMMAND_ARGS = ['outdated', '-r', '--format', 'json'];
const OUTDATED_TIMEOUT_MS = 90_000;
const ISSUE_TITLE = 'Review weekly dependency maintenance';

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

export function buildDependencySweepResult({
	outdatedDependencies,
	auditAdvisories,
	allowlistEntries,
	overrides
}: {
	outdatedDependencies: OutdatedDependencyMap;
	auditAdvisories: ReturnType<typeof collectAuditAdvisories>;
	allowlistEntries: ReturnType<typeof readAllowlist>;
	overrides: PnpmOverride[];
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
		hasItemsToReview:
			directDependencyCount > 0 || unallowlistedAdvisories.length > 0
	};
}

export function runDependencySweep(): DependencySweepResult {
	return buildDependencySweepResult({
		outdatedDependencies: runOutdated(),
		auditAdvisories: collectAuditAdvisories(runAudit()),
		allowlistEntries: readAllowlist(),
		overrides: readPnpmOverrides()
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
	advisory: typeof buildDependencySweepResult extends never
		? never
		: DependencySweepResult['allAuditAdvisories'][number]
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
		'This issue is maintained by the scheduled dependency sweep workflow. It should stay open only while direct dependency updates or unallowlisted advisories require review.'
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
		formatGithubOutputValue('issue_title', result.issueTitle, createToken),
		formatGithubOutputValue('summary', buildSummary(result), createToken),
		formatGithubOutputValue('issue_body', buildIssueBody(result), createToken)
	];
}

export function main(argv = process.argv.slice(2)): DependencySweepResult {
	const options = parseArgs(argv);
	const result = runDependencySweep();

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

export function runCli() {
	try {
		main();
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
	runCli();
}
