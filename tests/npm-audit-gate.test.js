import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
	collectAuditAdvisories,
	findUnallowlistedAdvisories
} from '../scripts/check-npm-audit.mjs';

describe('npm audit gate', () => {
	it('collects concrete advisory records from npm audit output', () => {
		const advisories = collectAuditAdvisories({
			vulnerabilities: {
				cookie: {
					severity: 'low',
					nodes: ['node_modules/cookie'],
					via: [
						{
							source: 1103907,
							name: 'cookie',
							title:
								'cookie accepts cookie name, path, and domain with out of bounds characters',
							url: 'https://github.com/advisories/GHSA-pxg6-pf52-xh8x'
						}
					]
				},
				'@sveltejs/kit': {
					severity: 'low',
					nodes: ['node_modules/@sveltejs/kit'],
					via: ['cookie']
				}
			}
		});

		assert.deepStrictEqual(advisories, [
			{
				package: 'cookie',
				source: 1103907,
				severity: 'low',
				title:
					'cookie accepts cookie name, path, and domain with out of bounds characters',
				url: 'https://github.com/advisories/GHSA-pxg6-pf52-xh8x',
				path: 'node_modules/cookie'
			}
		]);
	});

	it('fails only on advisories missing from the allowlist', () => {
		const advisories = [
			{
				package: 'cookie',
				source: 1103907,
				severity: 'low',
				title: 'known advisory',
				path: 'node_modules/cookie'
			},
			{
				package: 'kleur',
				source: 2200001,
				severity: 'moderate',
				title: 'new advisory',
				path: 'node_modules/kleur'
			}
		];

		const unallowlisted = findUnallowlistedAdvisories(advisories, [
			{
				package: 'cookie',
				source: 1103907,
				path: 'node_modules/cookie'
			}
		]);

		assert.deepStrictEqual(unallowlisted, [advisories[1]]);
	});
});
