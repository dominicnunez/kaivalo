import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
	buildDependencySweepResult,
	buildIssueBody,
	buildSummary,
	createGithubOutputDelimiter,
	formatGithubOutputEntries,
	groupOutdatedDependenciesByWorkspace,
	parseOutdatedReport
} from '../scripts/check-dependency-sweep.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const HUB_DIR = path.join(ROOT, 'apps', 'hub');
const UI_DIR = path.join(ROOT, 'packages', 'ui');

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

	it('builds issue content and github outputs from the dependency state', () => {
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
			overrides: [{ name: 'flatted', value: '3.4.2' }]
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
		assert.match(issueBody, /- flatted: 3\.4\.2/);

		const fixedToken = () => 'fixed-token';
		const entries = formatGithubOutputEntries(result, fixedToken).join('\n');
		assert.match(entries, /^has_items_to_review=true$/m);
		assert.match(
			entries,
			/^issue_title=Review weekly dependency maintenance$/m
		);
		assert.match(entries, /^summary<<kaivalo_output_fixed-token$/m);
		assert.match(entries, /^issue_body<<kaivalo_output_fixed-token$/m);
	});

	it('generates a delimiter that does not collide with output content', () => {
		const value = 'line one\nkaivalo_output_fixed-token\nline two';
		let callCount = 0;
		const delimiter = createGithubOutputDelimiter(value, () => {
			callCount += 1;
			return callCount === 1 ? 'fixed-token' : 'alternate-token';
		});

		assert.notStrictEqual(delimiter, 'kaivalo_output_fixed-token');
		assert.ok(!value.includes(delimiter));
	});
});
