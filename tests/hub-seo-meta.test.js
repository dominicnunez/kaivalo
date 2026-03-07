import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getHomeMeta } from '../apps/hub/src/lib/seo/home-meta.js';

function assertNonEmptyString(value, fieldName) {
	assert.strictEqual(typeof value, 'string', `${fieldName} should be a string`);
	assert.notStrictEqual(value.trim(), '', `${fieldName} should be non-empty`);
}

describe('hub seo metadata behavior', () => {
	it('returns complete metadata for social and search previews', () => {
		const meta = getHomeMeta();
		assertNonEmptyString(meta.title, 'title');
		assertNonEmptyString(meta.description, 'description');
		assertNonEmptyString(meta.imageAlt, 'imageAlt');
		assert.strictEqual(meta.twitterCard, 'summary_large_image');
	});

	it('uses absolute HTTPS URLs for canonical and image metadata', () => {
		const meta = getHomeMeta();
		const url = new URL(meta.url);
		const image = new URL(meta.image);
		assert.strictEqual(url.protocol, 'https:');
		assert.strictEqual(image.protocol, 'https:');
		assert.strictEqual(url.hostname, 'kaivalo.com');
		assert.strictEqual(image.hostname, 'kaivalo.com');
	});
});
