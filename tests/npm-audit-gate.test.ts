import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	AUDIT_TIMEOUT_MS,
	collectAuditAdvisories,
	findUnallowlistedAdvisories,
	readAllowlist,
	runAudit
} from '../scripts/check-npm-audit.ts';

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
				path: 'node_modules/cookie',
				url: 'https://github.com/advisories/GHSA-known'
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
				severity: 'low',
				title: 'known advisory',
				path: 'node_modules/cookie',
				url: 'https://github.com/advisories/GHSA-known'
			}
		]);

		assert.deepStrictEqual(unallowlisted, [advisories[1]]);
	});

	it('fails closed when advisory severity or title changes under the same source id', () => {
		const advisories = [
			{
				package: 'cookie',
				source: 1103907,
				severity: 'moderate',
				title: 'known advisory with revised severity',
				path: 'node_modules/cookie'
			}
		];

		const unallowlisted = findUnallowlistedAdvisories(advisories, [
			{
				package: 'cookie',
				source: 1103907,
				severity: 'low',
				title: 'known advisory',
				path: 'node_modules/cookie'
			}
		]);

		assert.deepStrictEqual(unallowlisted, advisories);
	});

	it('rejects allowlist entries missing reviewed advisory metadata', () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'npm-audit-allowlist-'));
		const allowlistPath = join(tempDir, 'allowlist.json');

		try {
			writeFileSync(
				allowlistPath,
				JSON.stringify([
					{
						package: 'cookie',
						source: 1103907,
						path: 'node_modules/cookie'
					}
				])
			);

			assert.throws(
				() => readAllowlist(allowlistPath),
				/error.*non-empty severity/i
			);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('fails fast when npm audit exceeds the configured timeout', () => {
		assert.throws(
			() =>
				runAudit({
					spawnSyncImpl: () => ({
						error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })
					})
				}),
			new Error(`npm audit exceeded ${AUDIT_TIMEOUT_MS}ms timeout`)
		);
	});

	it('rejects malformed JSON output from npm audit', () => {
		assert.throws(
			() =>
				runAudit({
					spawnSyncImpl: () => ({
						status: 1,
						stdout: '{not json}',
						stderr: ''
					})
				}),
			(error) => {
				assert.match(error.message, /npm audit returned invalid JSON/);
				return true;
			}
		);
	});

	it('surfaces abnormal npm audit exits when no report is returned', () => {
		assert.throws(
			() =>
				runAudit({
					spawnSyncImpl: () => ({
						status: null,
						signal: 'SIGTERM',
						stdout: '',
						stderr: ''
					})
				}),
			new Error('npm audit failed: terminated by SIGTERM')
		);
	});
});
