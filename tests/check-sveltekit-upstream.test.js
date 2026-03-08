import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
	FETCH_TIMEOUT_MS,
	createFetchErrorMessage,
	readCurrentVersion,
	readLatestMetadata
} from '../scripts/check-sveltekit-upstream.mjs';

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
});
