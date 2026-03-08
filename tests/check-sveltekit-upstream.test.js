import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
	FETCH_TIMEOUT_MS,
	createFetchErrorMessage,
	readLatestMetadata
} from '../scripts/check-sveltekit-upstream.mjs';

describe('check-sveltekit-upstream', () => {
	it('uses a bounded timeout when fetching registry metadata', async () => {
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

		const metadata = await readLatestMetadata({ fetchImpl: fetchMock });

		assert.deepStrictEqual(metadata, {
			version: '2.53.4',
			cookieRange: '^0.6.0'
		});
		assert.strictEqual(fetchMock.mock.calls.length, 1);
		const [url, options] = fetchMock.mock.calls[0].arguments;
		assert.match(String(url), /registry\.npmjs\.org/);
		assert.strictEqual(options.headers.accept, 'application/json');
		assert.ok(options.signal instanceof AbortSignal);
		assert.ok(
			AbortSignal.timeout(FETCH_TIMEOUT_MS).constructor ===
				options.signal.constructor
		);
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
});
