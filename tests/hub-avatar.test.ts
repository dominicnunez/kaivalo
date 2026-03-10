import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { httpGet, startHubPreview } from './helpers/hub-preview.ts';

const PREVIEW_FIXTURE_IMPORT = new URL(
	'./helpers/hub-preview-fixtures.mjs',
	import.meta.url
).href;
const AVATAR_SOURCE =
	'https://avatars.githubusercontent.com/u/1?token=signed#tracker';
const PEER_ADDRESS_OVERRIDE_HEADER = 'x-kaivalo-preview-peer-address';

function getAvatarUrl(baseUrl) {
	return `${baseUrl}/avatar?source=${encodeURIComponent(AVATAR_SOURCE)}`;
}

async function hitAvatar(preview, headers = {}) {
	return httpGet(getAvatarUrl(preview.baseUrl), headers);
}

async function consumeAvatarQuota(preview, requestCount, headers = {}) {
	for (let index = 0; index < requestCount; index += 1) {
		const response = await hitAvatar(preview, headers);
		assert.strictEqual(
			response.statusCode,
			200,
			`expected warmup request ${index + 1} to succeed`
		);
	}
}

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
			const response = await hitAvatar(preview);

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

	it('returns 429 after repeated avatar requests from the same client', async () => {
		const preview = await startHubPreview({
			shared: false,
			env: {
				HUB_PREVIEW_AVATAR_FIXTURE_MODE: 'success'
			},
			imports: [PREVIEW_FIXTURE_IMPORT]
		});

		try {
			await consumeAvatarQuota(preview, 30);

			const limited = await hitAvatar(preview);

			assert.strictEqual(limited.statusCode, 429);
			assert.strictEqual(limited.headers['retry-after'], '60');
			assert.strictEqual(limited.data, 'Too many requests');
		} finally {
			await preview.stop();
		}
	});

	it('rate limits trusted proxy traffic by the forwarded client address', async () => {
		const preview = await startHubPreview({
			shared: false,
			env: {
				HUB_PREVIEW_AVATAR_FIXTURE_MODE: 'success',
				TRUST_X_FORWARDED_PROTO: 'true',
				TRUSTED_PROXY_IPS: '203.0.113.2'
			},
			imports: [PREVIEW_FIXTURE_IMPORT]
		});
		const proxyHeaders = {
			'x-forwarded-for': '198.51.100.10',
			[PEER_ADDRESS_OVERRIDE_HEADER]: '203.0.113.2'
		};

		try {
			await consumeAvatarQuota(preview, 30, proxyHeaders);

			const limited = await hitAvatar(preview, proxyHeaders);

			assert.strictEqual(limited.statusCode, 429);
			assert.strictEqual(limited.headers['retry-after'], '60');
		} finally {
			await preview.stop();
		}
	});

	it('falls back to the direct proxy address when forwarded headers are malformed', async () => {
		const preview = await startHubPreview({
			shared: false,
			env: {
				HUB_PREVIEW_AVATAR_FIXTURE_MODE: 'success',
				TRUST_X_FORWARDED_PROTO: 'true',
				TRUSTED_PROXY_IPS: '203.0.113.1,203.0.113.2'
			},
			imports: [PREVIEW_FIXTURE_IMPORT]
		});
		const malformedHeaders = {
			'x-forwarded-for': '198.51.100.10, garbage',
			[PEER_ADDRESS_OVERRIDE_HEADER]: '203.0.113.2'
		};
		const otherProxyHeaders = {
			...malformedHeaders,
			[PEER_ADDRESS_OVERRIDE_HEADER]: '203.0.113.1'
		};

		try {
			await consumeAvatarQuota(preview, 30, malformedHeaders);

			const limited = await hitAvatar(preview, malformedHeaders);
			const otherProxy = await hitAvatar(preview, otherProxyHeaders);

			assert.strictEqual(limited.statusCode, 429);
			assert.strictEqual(otherProxy.statusCode, 200);
		} finally {
			await preview.stop();
		}
	});

	it('returns 503 when the runtime cannot determine a client address', async () => {
		const preview = await startHubPreview({
			shared: false,
			env: {
				HUB_PREVIEW_AVATAR_FIXTURE_MODE: 'success',
				ADDRESS_HEADER: 'x-forwarded-for',
				XFF_DEPTH: '1'
			},
			imports: [PREVIEW_FIXTURE_IMPORT]
		});

		try {
			const response = await hitAvatar(preview, {
				'x-forwarded-for': 'garbage',
				[PEER_ADDRESS_OVERRIDE_HEADER]: 'missing'
			});

			assert.strictEqual(response.statusCode, 503);
			assert.strictEqual(response.data, 'Service unavailable');
		} finally {
			await preview.stop();
		}
	});
});
