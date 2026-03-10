import { describe, expect, it } from 'vitest';

import { getTrustedClientAddress } from './trusted-client-address.ts';

describe('trusted client address', () => {
	it('returns the direct client address when the request did not come from a trusted proxy', () => {
		expect(
			getTrustedClientAddress({
				directClientAddress: '203.0.113.10',
				forwardedForHeader: '198.51.100.10',
				trustedProxyIps: ['203.0.113.1']
			})
		).toBe('203.0.113.10');
	});

	it('returns the nearest untrusted forwarded hop behind trusted proxies', () => {
		expect(
			getTrustedClientAddress({
				directClientAddress: '203.0.113.2',
				forwardedForHeader: '198.51.100.10, 203.0.113.1',
				trustedProxyIps: ['203.0.113.1', '203.0.113.2']
			})
		).toBe('198.51.100.10');
	});

	it('returns an empty address when a trusted proxy chain omits client address data', () => {
		expect(
			getTrustedClientAddress({
				directClientAddress: '203.0.113.2',
				forwardedForHeader: null,
				trustedProxyIps: ['203.0.113.2']
			})
		).toBe('');
	});

	it('returns an empty address when forwarded hops are malformed', () => {
		expect(
			getTrustedClientAddress({
				directClientAddress: '203.0.113.2',
				forwardedForHeader: '198.51.100.10, not-an-ip',
				trustedProxyIps: ['203.0.113.2']
			})
		).toBe('');
	});
});
