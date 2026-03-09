import { describe, expect, it } from 'vitest';
import {
	TRUSTED_AVATAR_CSP_SOURCES,
	isTrustedAvatarHost
} from './trusted-hosts.ts';

describe('trusted avatar hosts', () => {
	it.each([
		'images.workoscdn.com',
		'avatars.githubusercontent.com',
		'lh3.googleusercontent.com',
		'lh12.googleusercontent.com'
	])('allows trusted avatar host %s', (hostname) => {
		expect(isTrustedAvatarHost(hostname)).toBe(true);
	});

	it.each([
		'workoscdn.com',
		'images.workoscdn.com.attacker.test',
		'googleusercontent.com',
		'lh.googleusercontent.com',
		'lh3.googleusercontent.com.attacker.test',
		'lh3-googleusercontent.com',
		'lh3.googleusercontents.com'
	])('rejects untrusted or lookalike avatar host %s', (hostname) => {
		expect(isTrustedAvatarHost(hostname)).toBe(false);
	});

	it('publishes CSP sources that match the trusted avatar policy', () => {
		expect(TRUSTED_AVATAR_CSP_SOURCES).toEqual([
			'https://images.workoscdn.com',
			'https://avatars.githubusercontent.com',
			'https://*.googleusercontent.com'
		]);
	});
});
