import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { httpGet, startHubPreview } from './helpers/hub-preview.ts';

const PREVIEW_FIXTURE_IMPORT = new URL(
	'./helpers/hub-preview-fixtures.mjs',
	import.meta.url
).href;

describe('avatar proxy preview behavior', () => {
	it('serves proxied avatar responses over HTTP with hardened headers', async () => {
		const preview = await startHubPreview({
			shared: false,
			env: {
				HUB_PREVIEW_AVATAR_FIXTURE_MODE: 'success'
			},
			imports: [PREVIEW_FIXTURE_IMPORT]
		});

		try {
			const response = await httpGet(
				`${preview.baseUrl}/avatar?source=${encodeURIComponent(
					'https://avatars.githubusercontent.com/u/1?token=signed#tracker'
				)}`
			);

			assert.strictEqual(response.statusCode, 200);
			assert.strictEqual(response.headers['content-type'], 'image/png');
			assert.strictEqual(
				response.headers['cache-control'],
				'public, max-age=300, stale-while-revalidate=86400'
			);
			assert.strictEqual(response.headers['x-content-type-options'], 'nosniff');
			assert.strictEqual(response.headers.etag, '"avatar-1"');
			assert.deepStrictEqual(response.body, Buffer.from('image-bytes'));
		} finally {
			await preview.stop();
		}
	});
});
