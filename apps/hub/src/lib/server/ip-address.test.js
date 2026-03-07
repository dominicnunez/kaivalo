import { describe, expect, it } from 'vitest';
import { canonicalizeIpAddress } from './ip-address.js';

describe('canonicalizeIpAddress', () => {
	it.each([
		['strips zone ids from ipv6 addresses', 'fe80::1%eth0', 'fe80::1'],
		['strips brackets and zone ids from ipv6 addresses', '[fe80::1%lo0]', 'fe80::1'],
		['normalizes bracketed ipv6 addresses', '[2001:DB8::1]', '2001:db8::1'],
		['normalizes ipv4-mapped ipv6 addresses', '::ffff:127.0.0.1', '127.0.0.1'],
		['normalizes bracketed ipv4-mapped ipv6 addresses', '[::ffff:127.0.0.1]', '127.0.0.1'],
		['normalizes case and whitespace for ipv4', '  203.0.113.9  ', '203.0.113.9'],
		['rejects malformed bracketed values', '[::1', ''],
		['rejects malformed ipv6 values with extra characters', '[2001:db8::1]junk', ''],
		['rejects blank values', '   ', '']
	])('%s', (_label, candidate, expected) => {
		expect(canonicalizeIpAddress(candidate)).toBe(expected);
	});
});
