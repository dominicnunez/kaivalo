import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { httpGet, startHubPreview } from './helpers/hub-preview.ts';

const PREVIEW_FIXTURE_IMPORT = new URL(
	'./helpers/hub-preview-fixtures.mjs',
	import.meta.url
).href;
const AVATAR_SOURCE =
	'https://avatars.githubusercontent.com/u/1?token=signed&size=96';
const PEER_ADDRESS_OVERRIDE_HEADER = 'x-kaivalo-preview-peer-address';
const PRIVATE_NO_STORE_CACHE_CONTROL = 'private, no-store';

function getAvatarUrl(baseUrl) {
	return `${baseUrl}/avatar?source=${encodeURIComponent(AVATAR_SOURCE)}`;
}

function assertAvatarSecurityHeaders(response) {
	assert.strictEqual(response.headers['x-frame-options'], 'DENY');
	assert.strictEqual(response.headers['x-content-type-options'], 'nosniff');
	assert.strictEqual(
		response.headers['referrer-policy'],
		'strict-origin-when-cross-origin'
	);
	assert.strictEqual(
		response.headers['permissions-policy'],
		'camera=(), microphone=(), geolocation=()'
	);
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

function startAvatarPreview(avatarFixtureMode, env = {}) {
	return startHubPreview({
		shared: false,
		env: {
			HUB_PREVIEW_AVATAR_FIXTURE_MODE: avatarFixtureMode,
			...env
		},
		imports: [PREVIEW_FIXTURE_IMPORT]
	});
}

async function assertAvatarFailureResponse(
	avatarFixtureMode,
	expectedStatus,
	expectedBody
) {
	const preview = await startAvatarPreview(avatarFixtureMode);

	try {
		const response = await hitAvatar(preview);

		assert.strictEqual(response.statusCode, expectedStatus);
		assert.strictEqual(response.data, expectedBody);
		assert.strictEqual(
			response.headers['cache-control'],
			PRIVATE_NO_STORE_CACHE_CONTROL
		);
		assertAvatarSecurityHeaders(response);
	} finally {
		await preview.stop();
	}
}

describe('avatar proxy preview behavior', () => {
	it('serves proxied avatar responses over HTTP with hardened headers', async () => {
		const preview = await startAvatarPreview('success');

		try {
			const response = await hitAvatar(preview);

			assert.strictEqual(response.statusCode, 200);
			assert.strictEqual(response.headers['content-type'], 'image/png');
			assert.strictEqual(
				response.headers['cache-control'],
				'public, max-age=300, stale-while-revalidate=86400'
			);
			assertAvatarSecurityHeaders(response);
			assert.strictEqual(response.headers.etag, '"avatar-1"');
			assert.deepStrictEqual(response.body, Buffer.from('image-bytes'));
		} finally {
			await preview.stop();
		}
	});

	it('returns 429 after repeated avatar requests from the same client', async () => {
		const preview = await startAvatarPreview('success');

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
		const preview = await startAvatarPreview('success', {
			TRUST_X_FORWARDED_PROTO: 'true',
			TRUSTED_PROXY_IPS: '203.0.113.2'
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
		const preview = await startAvatarPreview('success', {
			TRUST_X_FORWARDED_PROTO: 'true',
			TRUSTED_PROXY_IPS: '203.0.113.1,203.0.113.2'
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
		const preview = await startAvatarPreview('success', {
			ADDRESS_HEADER: 'x-forwarded-for',
			XFF_DEPTH: '1'
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

	for (const [name, fixtureMode, expectedStatus, expectedBody] of [
		[
			'returns 504 when the upstream avatar fetch times out',
			'timeout',
			504,
			'Gateway timeout'
		],
		[
			'returns 502 when the upstream avatar response is not an image',
			'non-image',
			502,
			'Bad gateway'
		],
		[
			'returns 502 when the upstream avatar service returns an error status',
			'upstream-error',
			502,
			'Bad gateway'
		],
		[
			'returns 502 when the upstream avatar exceeds the size limit',
			'oversized',
			502,
			'Bad gateway'
		]
	]) {
		it(name, async () => {
			await assertAvatarFailureResponse(
				fixtureMode,
				expectedStatus,
				expectedBody
			);
		});
	}
});
