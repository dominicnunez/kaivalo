import { describe, expect, it } from 'vitest';
import {
	normalizeSameOriginRedirectLocation,
	normalizeTrustedRedirectLocation
} from './safe-redirect.ts';

const REQUEST_ORIGIN = 'https://kaivalo.test';

describe('normalizeTrustedRedirectLocation', () => {
	it.each([
		'/%0A//evil.example/path',
		'/%09//evil.example/path',
		'/%2F%2Fevil.example/path',
		'/%5C//evil.example/path',
		'/%250A//evil.example/path',
		'/%252F%252Fevil.example/path'
	])('rejects unsafe encoded relative redirect variant %s', (location) => {
		expect(
			normalizeTrustedRedirectLocation(location, REQUEST_ORIGIN)
		).toBeNull();
	});

	it.each([
		'https://kaivalo.test/%0A//evil.example/path',
		'https://kaivalo.test/%09//evil.example/path',
		'https://kaivalo.test/%2F%2Fevil.example/path',
		'https://kaivalo.test/%5C//evil.example/path'
	])(
		'rejects same-origin absolute redirects that decode into unsafe paths: %s',
		(location) => {
			expect(
				normalizeSameOriginRedirectLocation(location, REQUEST_ORIGIN)
			).toBeNull();
		}
	);

	it('preserves ordinary same-origin paths', () => {
		expect(
			normalizeTrustedRedirectLocation(
				'/account?from=auth#done',
				REQUEST_ORIGIN
			)
		).toBe('/account?from=auth#done');
	});
});
