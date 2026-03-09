import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
	FETCH_TIMEOUT_MS,
	createGithubOutputDelimiter,
	createFetchErrorMessage,
	formatGithubOutputEntries,
	readCurrentVersion,
	readLatestMetadata
} from '../scripts/check-sveltekit-upstream.ts';

describe('check-sveltekit-upstream', () => {
	it('uses a bounded timeout when fetching registry metadata', async () => {
		const controller = new AbortController();
		const fetchMock = mock.fn(async () => {
			return {
				ok: true,
				async json() {
					return {
						version: '2.53.4',
						dependencies: {
							cookie: '^0.6.0'
						}
					};
				}
			};
		});
		const originalTimeout = AbortSignal.timeout;
		AbortSignal.timeout = mock.fn(() => controller.signal);

		try {
			const metadata = await readLatestMetadata({ fetchImpl: fetchMock });

			assert.deepStrictEqual(metadata, {
				version: '2.53.4',
				cookieRange: '^0.6.0'
			});
			assert.strictEqual(fetchMock.mock.calls.length, 1);
			assert.strictEqual(AbortSignal.timeout.mock.calls.length, 1);
			assert.deepStrictEqual(AbortSignal.timeout.mock.calls[0].arguments, [
				FETCH_TIMEOUT_MS
			]);
			const [url, options] = fetchMock.mock.calls[0].arguments;
			assert.match(String(url), /registry\.npmjs\.org/);
			assert.strictEqual(options.headers.accept, 'application/json');
			assert.ok(options.signal instanceof AbortSignal);
			assert.strictEqual(options.signal, controller.signal);
			assert.strictEqual(options.signal.aborted, false);
		} finally {
			AbortSignal.timeout = originalTimeout;
		}
	});

	it('fails with a timeout-specific message when the fetch is aborted by the timeout signal', async () => {
		const controller = new AbortController();
		const originalTimeout = AbortSignal.timeout;
		AbortSignal.timeout = mock.fn(() => controller.signal);

		try {
			await assert.rejects(
				() =>
					readLatestMetadata({
						fetchImpl: (_url, options) =>
							new Promise((_, reject) => {
								options.signal.addEventListener(
									'abort',
									() =>
										reject(
											new DOMException(
												'The operation was aborted.',
												'TimeoutError'
											)
										),
									{ once: true }
								);
								controller.abort(
									new DOMException('The operation was aborted.', 'TimeoutError')
								);
							})
					}),
				(error) => {
					assert.match(
						error.message,
						new RegExp(
							`Timed out fetching latest @sveltejs/kit metadata after ${FETCH_TIMEOUT_MS}ms`
						)
					);
					return true;
				}
			);
		} finally {
			AbortSignal.timeout = originalTimeout;
		}
	});

	it('turns aborts into an actionable timeout message', () => {
		const timeoutError = new DOMException(
			'The operation was aborted.',
			'TimeoutError'
		);

		assert.strictEqual(
			createFetchErrorMessage(timeoutError),
			`Timed out fetching latest @sveltejs/kit metadata after ${FETCH_TIMEOUT_MS}ms`
		);
	});

	it('surfaces network failures with context', () => {
		const networkError = new Error('socket hang up');

		assert.strictEqual(
			createFetchErrorMessage(networkError),
			'Failed to fetch latest @sveltejs/kit metadata: socket hang up'
		);
	});

	it('rejects malformed successful registry payloads with a validation error', async () => {
		await assert.rejects(
			() =>
				readLatestMetadata({
					fetchImpl: async () => ({
						ok: true,
						async json() {
							return {
								dependencies: {
									cookie: '^0.6.0'
								}
							};
						}
					})
				}),
			(error) => {
				assert.strictEqual(
					error.message,
					'Failed to parse latest @sveltejs/kit metadata: expected a valid semver version string'
				);
				return true;
			}
		);
	});

	it('reads the resolved version from the repository lockfile outside the cwd', async () => {
		const originalCwd = process.cwd();
		const tempCwd = mkdtempSync(join(tmpdir(), 'kaivalo-upstream-check-'));

		try {
			process.chdir(tempCwd);
			const version = await readCurrentVersion();
			assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
		} finally {
			process.chdir(originalCwd);
		}
	});

	it('formats github output with collision-safe delimiters for multiline values', async () => {
		const githubOutputPath = join(
			mkdtempSync(join(tmpdir(), 'kaivalo-upstream-output-')),
			'github-output.txt'
		);
		const result = {
			currentVersion: '2.20.0',
			latestVersion: '2.20.1',
			latestCookieRange: '^0.6.0',
			hasNewerUpstream: true,
			issueTitle: 'Track upstream @sveltejs/kit updates for cookie advisory'
		};
		const tokens = ['safe-summary', 'safe-body'];
		let tokenIndex = 0;
		const nextToken = () => tokens[tokenIndex++];
		const entries = formatGithubOutputEntries(result, nextToken);
		const { appendFile } = await import('node:fs/promises');

		await appendFile(githubOutputPath, `${entries.join('\n')}\n`);

		const serialized = readFileSync(githubOutputPath, 'utf8');
		assert.match(serialized, /summary<<kaivalo_output_safe-summary/);
		assert.match(serialized, /issue_body<<kaivalo_output_safe-body/);
		assert.doesNotMatch(serialized, /<<EOF/);
		assert.match(serialized, /Current resolved version: `2\.20\.0`/);
		assert.match(
			serialized,
			/Cookie advisory exception: `audit\/exceptions\/risks\.md`/
		);
	});

	it('regenerates github output delimiters when the candidate appears in the value', () => {
		const tokens = ['EOF', 'safe'];
		let tokenIndex = 0;
		const delimiter = createGithubOutputDelimiter(
			'first line\nkaivalo_output_EOF\nlast line',
			() => tokens[tokenIndex++]
		);

		assert.strictEqual(delimiter, 'kaivalo_output_safe');
	});
});
