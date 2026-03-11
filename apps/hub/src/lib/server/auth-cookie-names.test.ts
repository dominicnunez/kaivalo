import { describe, expect, it } from 'vitest';

import { getSensitiveAuthCookieNames } from './auth-cookie-names.ts';

describe('getSensitiveAuthCookieNames', () => {
	it('includes the exact configured host-prefixed cookie name and related variants', () => {
		expect(
			Array.from(getSensitiveAuthCookieNames('__Host-wos_session')).sort()
		).toEqual(['__host-wos_session', '__secure-wos_session', 'wos_session']);
	});

	it('derives prefixed variants from an unprefixed cookie name', () => {
		expect(
			Array.from(getSensitiveAuthCookieNames('wos_session')).sort()
		).toEqual(['__host-wos_session', '__secure-wos_session', 'wos_session']);
	});
});
