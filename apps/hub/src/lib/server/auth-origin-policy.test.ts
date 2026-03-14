import { describe, expect, it } from 'vitest';
import {
	getTrustedWorkosAuthOrigin,
	normalizeWorkosApiHostname
} from './auth-origin-policy.ts';

describe('auth origin policy', () => {
	it('defaults the hosted auth origin to the WorkOS public hostname', () => {
		expect(normalizeWorkosApiHostname(undefined)).toBe('api.workos.com');
		expect(normalizeWorkosApiHostname('   ')).toBe('api.workos.com');
		expect(getTrustedWorkosAuthOrigin({})).toBe('https://api.workos.com');
	});

	it('normalizes a configured hosted auth hostname', () => {
		expect(normalizeWorkosApiHostname(' auth.kaivalo-login.com ')).toBe(
			'auth.kaivalo-login.com'
		);
		expect(
			getTrustedWorkosAuthOrigin({
				apiHostname: 'auth.kaivalo-login.com'
			})
		).toBe('https://auth.kaivalo-login.com');
	});

	it.each([
		'https://auth.kaivalo-login.com/login',
		'auth.kaivalo-login.com:443',
		'auth.kaivalo-login.com/login'
	])('rejects malformed hosted auth hostnames: %s', (hostname) => {
		expect(() => normalizeWorkosApiHostname(hostname)).toThrow(
			/WORKOS_API_HOSTNAME must be a hostname without protocol, path, credentials, or port/
		);
	});
});
