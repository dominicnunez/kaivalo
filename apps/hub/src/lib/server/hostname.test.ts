import { describe, expect, it } from 'vitest';
import { isValidHostname, parseCanonicalHostname } from '../hostname.ts';

describe('hostname validation', () => {
	it.each(['api.workos.com', 'auth.kaivalo-login.test', 'sweep.kaivalo.com'])(
		'accepts valid hostname %s',
		(hostname) => {
			expect(isValidHostname(hostname)).toBe(true);
		}
	);

	it.each([
		'',
		'.kaivalo.com',
		'..kaivalo.com',
		'-bad.example',
		'bad-.example',
		'bad..example'
	])('rejects malformed hostname %s', (hostname) => {
		expect(isValidHostname(hostname)).toBe(false);
	});
});

describe('canonical hostname parsing', () => {
	it('normalizes valid hostnames from URL parsing', () => {
		expect(parseCanonicalHostname('Auth.Kaivalo-Login.Test')).toBe(
			'auth.kaivalo-login.test'
		);
	});

	it.each([
		'https://auth.kaivalo-login.test/path',
		'.kaivalo-login.com',
		'bad-.example',
		'bad.example:443',
		'user@auth.kaivalo-login.test',
		'user:password@auth.kaivalo-login.test',
		'auth.kaivalo-login.test?debug=1',
		'auth.kaivalo-login.test#fragment'
	])('rejects invalid canonical hostname input %s', (value) => {
		expect(parseCanonicalHostname(value)).toBeNull();
	});
});
