import { describe, expect, it } from 'vitest';
import {
	isRedirectLikeObject,
	normalizeSameOriginRedirectLocation,
	normalizeTrustedRedirectLocation
} from './safe-redirect.ts';

const REQUEST_ORIGIN = 'https://kaivalo.test';

describe('normalizeTrustedRedirectLocation', () => {
	it('only treats supported redirect statuses as redirect-like objects', () => {
		expect(
			isRedirectLikeObject({
				status: 303,
				location: '/services'
			})
		).toBe(true);
		expect(
			isRedirectLikeObject({
				status: 200,
				location: '/services'
			})
		).toBe(false);
		expect(
			isRedirectLikeObject({
				status: 309,
				location: '/services'
			})
		).toBe(false);
	});

	it.each([
		'/%0A//evil.example/path',
		'/%09//evil.example/path',
		'/%2F%2Fevil.example/path',
		'/%5C//evil.example/path',
		'/%250A//evil.example/path',
		'/%252F%252Fevil.example/path'
	])('rejects unsafe encoded relative redirect variant %s', (location) => {
		expect(
			normalizeTrustedRedirectLocation(location, {
				requestOrigin: REQUEST_ORIGIN,
				trustedOrigin: REQUEST_ORIGIN
			})
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
				normalizeSameOriginRedirectLocation(location, {
					requestOrigin: REQUEST_ORIGIN,
					trustedOrigin: REQUEST_ORIGIN
				})
			).toBeNull();
		}
	);

	it('preserves ordinary same-origin paths', () => {
		expect(
			normalizeTrustedRedirectLocation('/account?from=auth#done', {
				requestOrigin: REQUEST_ORIGIN,
				trustedOrigin: REQUEST_ORIGIN
			})
		).toBe('/account?from=auth#done');
	});

	it('pins relative paths to the trusted origin when the request host is poisoned', () => {
		expect(
			normalizeTrustedRedirectLocation('/account?from=auth#done', {
				requestOrigin: 'https://attacker.test',
				trustedOrigin: REQUEST_ORIGIN
			})
		).toBe('https://kaivalo.test/account?from=auth#done');
	});

	it('preserves absolute redirects to the trusted origin when the request host is poisoned', () => {
		expect(
			normalizeSameOriginRedirectLocation(
				'https://kaivalo.test/services?welcome=1#shell',
				{
					requestOrigin: 'https://attacker.test',
					trustedOrigin: REQUEST_ORIGIN
				}
			)
		).toBe('https://kaivalo.test/services?welcome=1#shell');
	});
});
