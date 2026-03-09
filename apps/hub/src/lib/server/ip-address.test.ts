import { describe, expect, it } from 'vitest';
import {
	canonicalizeIpAddress,
	isLoopbackHostname,
	isLoopbackIpAddress
} from './ip-address.ts';

describe('canonicalizeIpAddress', () => {
	it.each([
		['strips zone ids from ipv6 addresses', 'fe80::1%eth0', 'fe80::1'],
		[
			'strips brackets and zone ids from ipv6 addresses',
			'[fe80::1%lo0]',
			'fe80::1'
		],
		['normalizes bracketed ipv6 addresses', '[2001:DB8::1]', '2001:db8::1'],
		['normalizes ipv4-mapped ipv6 addresses', '::ffff:127.0.0.1', '127.0.0.1'],
		[
			'normalizes bracketed ipv4-mapped ipv6 addresses',
			'[::ffff:127.0.0.1]',
			'127.0.0.1'
		],
		[
			'normalizes case and whitespace for ipv4',
			'  203.0.113.9  ',
			'203.0.113.9'
		],
		['rejects malformed bracketed values', '[::1', ''],
		[
			'rejects malformed ipv6 values with extra characters',
			'[2001:db8::1]junk',
			''
		],
		['rejects blank values', '   ', '']
	])('%s', (_label, candidate, expected) => {
		expect(canonicalizeIpAddress(candidate)).toBe(expected);
	});
});

describe('isLoopbackIpAddress', () => {
	it.each([
		['matches localhost ipv4 loopback', '127.0.0.1', true],
		['matches all ipv4 loopback addresses', '127.255.255.254', true],
		['matches ipv6 loopback', '::1', true],
		['matches ipv4-mapped ipv6 loopback', '::ffff:127.0.0.1', true],
		['rejects unspecified ipv6', '::', false],
		['rejects private ipv4 addresses', '192.168.1.25', false],
		['rejects public ipv4 addresses', '203.0.113.9', false],
		['rejects malformed values', 'localhost', false]
	])('%s', (_label, candidate, expected) => {
		expect(isLoopbackIpAddress(candidate)).toBe(expected);
	});
});

describe('isLoopbackHostname', () => {
	it.each([
		['matches localhost', 'localhost', true],
		['matches localhost subdomains', 'api.localhost', true],
		['matches ipv4 loopback hosts', '127.0.0.2', true],
		['matches ipv6 loopback hosts', '[::1]', true],
		['rejects private network hosts', '192.168.1.25', false],
		['rejects public hostnames', 'kaivalo.test', false]
	])('%s', (_label, candidate, expected) => {
		expect(isLoopbackHostname(candidate)).toBe(expected);
	});
});
