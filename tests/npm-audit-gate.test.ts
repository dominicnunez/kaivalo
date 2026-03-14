import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
	AUDIT_MAX_ATTEMPTS,
	AUDIT_RETRY_DELAY_MS,
	AUDIT_TIMEOUT_MS,
	collectAuditAdvisories,
	findUnallowlistedAdvisories,
	readAllowlist,
	runAudit
} from '../scripts/check-npm-audit.ts';

const ROOT = resolve(import.meta.dirname, '..');

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

	it('preserves advisory-level severity for mixed-severity vulnerabilities', () => {
		const advisories = collectAuditAdvisories({
			vulnerabilities: {
				vite: {
					severity: 'high',
					nodes: ['node_modules/vite'],
					via: [
						{
							source: 1100001,
							name: 'esbuild',
							severity: 'moderate',
							title: 'esbuild advisory',
							url: 'https://github.com/advisories/GHSA-esbuild'
						},
						{
							source: 1100002,
							name: 'vite',
							severity: 'low',
							title: 'vite advisory',
							url: 'https://github.com/advisories/GHSA-vite'
						}
					]
				}
			}
		});

		assert.deepStrictEqual(advisories, [
			{
				package: 'esbuild',
				source: 1100001,
				severity: 'moderate',
				title: 'esbuild advisory',
				url: 'https://github.com/advisories/GHSA-esbuild',
				path: 'node_modules/vite'
			},
			{
				package: 'vite',
				source: 1100002,
				severity: 'low',
				title: 'vite advisory',
				url: 'https://github.com/advisories/GHSA-vite',
				path: 'node_modules/vite'
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

	it('retries transient npm audit timeouts before succeeding', () => {
		const retryDelays: number[] = [];
		let attemptCount = 0;

		const report = runAudit({
			spawnSyncImpl: () => {
				attemptCount += 1;
				if (attemptCount === 1) {
					return {
						error: Object.assign(new Error('timed out'), {
							code: 'ETIMEDOUT'
						})
					};
				}

				return {
					status: 0,
					stdout: '{"vulnerabilities":{}}',
					stderr: ''
				};
			},
			sleepImpl: (delayMs) => {
				retryDelays.push(delayMs);
			}
		});

		assert.deepStrictEqual(report, { vulnerabilities: {} });
		assert.strictEqual(attemptCount, 2);
		assert.deepStrictEqual(retryDelays, [AUDIT_RETRY_DELAY_MS]);
	});

	it('retries transient npm audit network errors before succeeding', () => {
		const retryDelays: number[] = [];
		let attemptCount = 0;

		const report = runAudit({
			spawnSyncImpl: () => {
				attemptCount += 1;
				if (attemptCount === 1) {
					return {
						error: Object.assign(
							new Error('getaddrinfo EAI_AGAIN registry.npmjs.org'),
							{
								code: 'EAI_AGAIN'
							}
						)
					};
				}

				return {
					status: 0,
					stdout: '{"vulnerabilities":{}}',
					stderr: ''
				};
			},
			sleepImpl: (delayMs) => {
				retryDelays.push(delayMs);
			}
		});

		assert.deepStrictEqual(report, { vulnerabilities: {} });
		assert.strictEqual(attemptCount, 2);
		assert.deepStrictEqual(retryDelays, [AUDIT_RETRY_DELAY_MS]);
	});

	it('retries transient registry failures that do not return a report', () => {
		const retryDelays: number[] = [];
		let attemptCount = 0;

		const report = runAudit({
			spawnSyncImpl: () => {
				attemptCount += 1;
				if (attemptCount === 1) {
					return {
						status: 1,
						stdout: '',
						stderr:
							'npm ERR! code E503\nnpm ERR! 503 Service Unavailable - POST https://registry.npmjs.org/-/npm/v1/security/audits/quick'
					};
				}

				return {
					status: 0,
					stdout: '{"vulnerabilities":{}}',
					stderr: ''
				};
			},
			sleepImpl: (delayMs) => {
				retryDelays.push(delayMs);
			}
		});

		assert.deepStrictEqual(report, { vulnerabilities: {} });
		assert.strictEqual(attemptCount, 2);
		assert.deepStrictEqual(retryDelays, [AUDIT_RETRY_DELAY_MS]);
	});

	it('fails after exhausting retry attempts for repeated timeouts', () => {
		const retryDelays: number[] = [];
		let attemptCount = 0;

		assert.throws(
			() =>
				runAudit({
					spawnSyncImpl: () => {
						attemptCount += 1;
						return {
							error: Object.assign(new Error('timed out'), {
								code: 'ETIMEDOUT'
							})
						};
					},
					sleepImpl: (delayMs) => {
						retryDelays.push(delayMs);
					}
				}),
			new Error(
				`npm audit exceeded ${AUDIT_TIMEOUT_MS}ms timeout after ${AUDIT_MAX_ATTEMPTS} attempts`
			)
		);

		assert.strictEqual(attemptCount, AUDIT_MAX_ATTEMPTS);
		assert.deepStrictEqual(retryDelays, [
			AUDIT_RETRY_DELAY_MS,
			AUDIT_RETRY_DELAY_MS * 2
		]);
	});

	it('fails immediately on non-timeout npm audit errors', () => {
		let attemptCount = 0;

		assert.throws(
			() =>
				runAudit({
					spawnSyncImpl: () => {
						attemptCount += 1;
						return {
							error: Object.assign(new Error('spawn ENOENT'), {
								code: 'ENOENT'
							})
						};
					},
					sleepImpl: () => {
						throw new Error('non-timeout failures should not sleep');
					}
				}),
			new Error('npm audit failed: spawn ENOENT')
		);

		assert.strictEqual(attemptCount, 1);
	});

	it('audits the full dependency tree instead of omitting dev dependencies', () => {
		let command;
		let args;
		const report = runAudit({
			spawnSyncImpl: (receivedCommand, receivedArgs) => {
				command = receivedCommand;
				args = receivedArgs;
				return {
					status: 0,
					stdout: '{"vulnerabilities":{}}',
					stderr: ''
				};
			}
		});

		assert.deepStrictEqual(report, { vulnerabilities: {} });
		assert.strictEqual(command, 'npm');
		assert.deepStrictEqual(args, ['audit', '--json']);
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

	it('reports top-level cli failures without an uncaught stack trace', () => {
		const result = spawnSync(process.execPath, ['scripts/check-npm-audit.ts'], {
			cwd: ROOT,
			env: {
				...process.env,
				PATH: '/definitely/missing'
			},
			encoding: 'utf8'
		});

		assert.strictEqual(result.status, 1);
		assert.match(result.stderr, /npm audit failed: spawnSync npm ENOENT/);
		assert.doesNotMatch(result.stderr, /^\s+at /m);
	});
});
