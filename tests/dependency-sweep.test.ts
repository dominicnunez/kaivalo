import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
	buildDependencySweepResult,
	buildIssueBody,
	buildSummary,
	createFetchErrorMessage,
	createGithubOutputDelimiter,
	FETCH_RETRY_DELAY_MS,
	FETCH_TIMEOUT_MS,
	formatGithubOutputEntries,
	groupOutdatedDependenciesByWorkspace,
	parseOutdatedReport,
	readCurrentSvelteKitVersion,
	readLatestSvelteKitMetadata
} from '../scripts/check-dependency-sweep.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const HUB_DIR = path.join(ROOT, 'apps', 'hub');
const UI_DIR = path.join(ROOT, 'packages', 'ui');

function createRegistryResponse(metadata: {
	version: string;
	dependencies: { cookie: string };
}) {
	return {
		ok: true,
		status: 200,
		statusText: 'OK',
		async json() {
			return metadata;
		}
	};
}

function createRegistryFailureResponse(status: number, statusText: string) {
	return {
		ok: false,
		status,
		statusText,
		async json() {
			throw new Error('json should not be called for failed responses');
		}
	};
}

function readGithubMultilineOutputEntry(serialized: string, name: string) {
	const entryHeader = new RegExp(`^${name}<<([^\\n]+)$`, 'm');
	const entryHeaderMatch = serialized.match(entryHeader);
	assert.ok(entryHeaderMatch, `expected ${name} output entry`);

	const delimiter = entryHeaderMatch[1];
	const entryPattern = new RegExp(
		`^${name}<<${delimiter}\\n([\\s\\S]*?)\\n${delimiter}$`,
		'm'
	);
	const entryMatch = serialized.match(entryPattern);
	assert.ok(entryMatch, `expected complete ${name} output block`);

	return {
		delimiter,
		value: entryMatch[1]
	};
}

describe('dependency sweep reporting', () => {
	it('parses empty and non-empty pnpm outdated reports', () => {
		assert.deepStrictEqual(parseOutdatedReport('   \n'), {});
		assert.deepStrictEqual(
			parseOutdatedReport(
				JSON.stringify({
					eslint: {
						current: '10.0.3',
						latest: '10.1.0',
						wanted: '10.0.3',
						isDeprecated: false,
						dependencyType: 'devDependencies',
						dependentPackages: [
							{
								name: 'kaivalo',
								location: ROOT
							}
						]
					}
				})
			),
			{
				eslint: {
					current: '10.0.3',
					latest: '10.1.0',
					wanted: '10.0.3',
					isDeprecated: false,
					dependencyType: 'devDependencies',
					dependentPackages: [
						{
							name: 'kaivalo',
							location: ROOT
						}
					]
				}
			}
		);
	});

	it('groups outdated dependencies by owning workspace', () => {
		assert.deepStrictEqual(
			groupOutdatedDependenciesByWorkspace({
				eslint: {
					current: '10.0.3',
					latest: '10.1.0',
					wanted: '10.0.3',
					isDeprecated: false,
					dependencyType: 'devDependencies',
					dependentPackages: [
						{
							name: 'kaivalo',
							location: ROOT
						}
					]
				},
				jsdom: {
					current: '29.0.0',
					latest: '29.0.1',
					wanted: '29.0.0',
					isDeprecated: false,
					dependencyType: 'devDependencies',
					dependentPackages: [
						{
							name: '@kaivalo/hub',
							location: HUB_DIR
						},
						{
							name: '@kaivalo/ui',
							location: UI_DIR
						}
					]
				}
			}),
			[
				{
					name: 'kaivalo',
					location: '.',
					dependencies: [
						{
							name: 'eslint',
							current: '10.0.3',
							latest: '10.1.0',
							wanted: '10.0.3',
							dependencyType: 'devDependencies',
							isDeprecated: false
						}
					]
				},
				{
					name: '@kaivalo/hub',
					location: 'apps/hub',
					dependencies: [
						{
							name: 'jsdom',
							current: '29.0.0',
							latest: '29.0.1',
							wanted: '29.0.0',
							dependencyType: 'devDependencies',
							isDeprecated: false
						}
					]
				},
				{
					name: '@kaivalo/ui',
					location: 'packages/ui',
					dependencies: [
						{
							name: 'jsdom',
							current: '29.0.0',
							latest: '29.0.1',
							wanted: '29.0.0',
							dependencyType: 'devDependencies',
							isDeprecated: false
						}
					]
				}
			]
		);
	});

	it('builds combined issue content and github outputs from dependency state', () => {
		const result = buildDependencySweepResult({
			outdatedDependencies: {
				eslint: {
					current: '10.0.3',
					latest: '10.1.0',
					wanted: '10.0.3',
					isDeprecated: false,
					dependencyType: 'devDependencies',
					dependentPackages: [
						{
							name: 'kaivalo',
							location: ROOT
						}
					]
				}
			},
			auditAdvisories: [
				{
					package: 'cookie',
					source: 1103907,
					severity: 'low',
					title:
						'cookie accepts cookie name, path, and domain with out of bounds characters',
					path: 'apps/hub > @sveltejs/kit > cookie',
					url: 'https://github.com/advisories/GHSA-pxg6-pf52-xh8x'
				},
				{
					package: 'flatted',
					source: 1114934,
					severity: 'high',
					title: 'Prototype Pollution via parse() in NodeJS flatted',
					path: 'kaivalo > eslint > flat-cache > flatted',
					url: 'https://github.com/advisories/GHSA-xxxx'
				}
			],
			allowlistEntries: [
				{
					package: 'cookie',
					source: 1103907,
					severity: 'low',
					title:
						'cookie accepts cookie name, path, and domain with out of bounds characters',
					path: 'apps/hub > @sveltejs/kit > cookie',
					url: 'https://github.com/advisories/GHSA-pxg6-pf52-xh8x',
					reason: 'Tracked upstream via SvelteKit issue'
				}
			],
			overrides: [{ name: 'flatted', value: '3.4.2' }],
			svelteKitUpstream: {
				currentVersion: '2.20.0',
				latestVersion: '2.20.1',
				latestCookieRange: '^0.6.0',
				hasNewerUpstream: true
			}
		});

		assert.strictEqual(
			result.issueTitle,
			'Review weekly dependency maintenance'
		);
		assert.strictEqual(result.directDependencyCount, 1);
		assert.strictEqual(result.unallowlistedAdvisories.length, 1);
		assert.strictEqual(result.hasItemsToReview, true);

		const summary = buildSummary(result);
		assert.match(summary, /Direct dependency updates requiring review: 1/);
		assert.match(summary, /Unallowlisted audit advisories requiring review: 1/);
		assert.match(summary, /Current resolved @sveltejs\/kit version: 2\.20\.0/);
		assert.match(summary, /Newer @sveltejs\/kit upstream available: yes/);

		const issueBody = buildIssueBody(result);
		assert.match(issueBody, /## Direct dependency updates/);
		assert.match(issueBody, /### kaivalo \(\.\)/);
		assert.match(
			issueBody,
			/- eslint \(devDependencies\): 10\.0\.3 -> 10\.1\.0 \(wanted 10\.0\.3\)/
		);
		assert.match(
			issueBody,
			/- flatted \(high\) source 1114934 at kaivalo > eslint > flat-cache > flatted: Prototype Pollution via parse\(\) in NodeJS flatted/
		);
		assert.match(issueBody, /## SvelteKit upstream review/);
		assert.match(
			issueBody,
			/Latest upstream `cookie` dependency range: `\^0\.6\.0`/
		);
		assert.match(issueBody, /- flatted: 3\.4\.2/);

		const fixedToken = () => 'fixed-token';
		const entries = formatGithubOutputEntries(result, fixedToken).join('\n');
		assert.match(entries, /^has_items_to_review=true$/m);
		assert.match(entries, /^has_newer_sveltekit_upstream=true$/m);
		assert.match(entries, /^current_sveltekit_version=2\.20\.0$/m);
		assert.match(
			entries,
			/^issue_title=Review weekly dependency maintenance$/m
		);
		assert.match(entries, /^summary<<kaivalo_output_fixed-token$/m);
		assert.match(entries, /^issue_body<<kaivalo_output_fixed-token$/m);
	});

	it('reads the resolved SvelteKit version from the repository lockfile outside the cwd', () => {
		const originalCwd = process.cwd();
		const tempCwd = mkdtempSync(join(tmpdir(), 'kaivalo-sweep-check-'));

		try {
			process.chdir(tempCwd);
			const version = readCurrentSvelteKitVersion();
			assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
		} finally {
			process.chdir(originalCwd);
		}
	});

	it('uses a bounded timeout when fetching latest SvelteKit metadata', async () => {
		const controller = new AbortController();
		const fetchMock = mock.fn(async () =>
			createRegistryResponse({
				version: '2.53.4',
				dependencies: {
					cookie: '^0.6.0'
				}
			})
		);
		const originalTimeout = AbortSignal.timeout;
		const timeoutMock = mock.fn(() => controller.signal);
		AbortSignal.timeout = timeoutMock as typeof AbortSignal.timeout;

		try {
			const metadata = await readLatestSvelteKitMetadata({
				fetchImpl: fetchMock
			});

			assert.deepStrictEqual(metadata, {
				version: '2.53.4',
				cookieRange: '^0.6.0'
			});
			assert.strictEqual(fetchMock.mock.calls.length, 1);
			assert.strictEqual(timeoutMock.mock.calls.length, 1);
			assert.deepStrictEqual(timeoutMock.mock.calls[0]?.arguments, [
				FETCH_TIMEOUT_MS
			]);
		} finally {
			AbortSignal.timeout = originalTimeout;
		}
	});

	it('retries transient upstream registry failures before succeeding', async () => {
		const sleepMock = mock.fn(async () => undefined);
		let attempt = 0;
		const fetchMock = mock.fn(async () => {
			attempt += 1;
			if (attempt === 1) {
				return createRegistryFailureResponse(503, 'Service Unavailable');
			}

			return createRegistryResponse({
				version: '2.53.4',
				dependencies: {
					cookie: '^0.6.0'
				}
			});
		});

		const metadata = await readLatestSvelteKitMetadata({
			fetchImpl: fetchMock,
			sleepImpl: sleepMock
		});

		assert.deepStrictEqual(metadata, {
			version: '2.53.4',
			cookieRange: '^0.6.0'
		});
		assert.strictEqual(fetchMock.mock.calls.length, 2);
		assert.deepStrictEqual(sleepMock.mock.calls[0]?.arguments, [
			FETCH_RETRY_DELAY_MS
		]);
	});

	it('turns aborts into an actionable fetch timeout message', () => {
		const timeoutError = new DOMException(
			'The operation was aborted.',
			'TimeoutError'
		);

		assert.strictEqual(
			createFetchErrorMessage(timeoutError),
			`Timed out fetching latest @sveltejs/kit metadata after ${FETCH_TIMEOUT_MS}ms`
		);
	});

	it('generates collision-safe multiline github output delimiters', () => {
		const value = 'line one\nkaivalo_output_fixed-token\nline two';
		let callCount = 0;
		const delimiter = createGithubOutputDelimiter(value, () => {
			callCount += 1;
			return callCount === 1 ? 'fixed-token' : 'alternate-token';
		});

		assert.notStrictEqual(delimiter, 'kaivalo_output_fixed-token');
		assert.ok(!value.includes(delimiter));
	});

	it('emits valid multiline github output blocks for the combined summary and issue body', () => {
		const result = buildDependencySweepResult({
			outdatedDependencies: {},
			auditAdvisories: [],
			allowlistEntries: [],
			overrides: [],
			svelteKitUpstream: {
				currentVersion: '2.20.1',
				latestVersion: '2.20.1',
				latestCookieRange: '^0.6.0',
				hasNewerUpstream: false
			}
		});
		const entries = formatGithubOutputEntries(result, () => 'safe-token').join(
			'\n'
		);

		const summaryEntry = readGithubMultilineOutputEntry(entries, 'summary');
		assert.match(summaryEntry.value, /Current resolved @sveltejs\/kit version/);

		const issueBodyEntry = readGithubMultilineOutputEntry(
			entries,
			'issue_body'
		);
		assert.match(issueBodyEntry.value, /## SvelteKit upstream review/);
	});
});
