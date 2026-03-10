import { describe, expect, it } from 'vitest';
import { getRequestPeerAddress } from './request-peer-address.ts';

function createEvent({
	platform,
	getClientAddress
}: {
	platform?: unknown;
	getClientAddress?: () => string;
} = {}) {
	return {
		platform,
		getClientAddress
	} as never;
}

describe('getRequestPeerAddress', () => {
	it('prefers the node platform socket remote address over other candidates', () => {
		expect(
			getRequestPeerAddress(
				createEvent({
					platform: {
						req: {
							socket: { remoteAddress: '::ffff:203.0.113.10' },
							connection: { remoteAddress: '203.0.113.11' }
						}
					},
					getClientAddress: () => '203.0.113.12'
				})
			)
		).toBe('203.0.113.10');
	});

	it('falls back to the node platform connection remote address when no socket address exists', () => {
		expect(
			getRequestPeerAddress(
				createEvent({
					platform: {
						req: {
							connection: { remoteAddress: '203.0.113.11' }
						}
					},
					getClientAddress: () => '203.0.113.12'
				})
			)
		).toBe('203.0.113.11');
	});

	it('falls back to getClientAddress when the runtime has no node platform address', () => {
		expect(
			getRequestPeerAddress(
				createEvent({
					getClientAddress: () => '::ffff:203.0.113.12'
				})
			)
		).toBe('203.0.113.12');
	});

	it('does not trust getClientAddress when a platform address is already available', () => {
		expect(
			getRequestPeerAddress(
				createEvent({
					platform: {
						req: {
							connection: { remoteAddress: '203.0.113.11' }
						}
					},
					getClientAddress: () => '198.51.100.44'
				})
			)
		).toBe('203.0.113.11');
	});
});
