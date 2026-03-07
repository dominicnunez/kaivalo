import { describe, expect, it } from 'vitest';
import { createSecurityHeadersHandle } from './workos-security.js';

describe('proxy ip trust canonicalization', () => {
	it('trusts bracketed and zone-suffixed IPv6 client addresses for forwarded proto', async () => {
		const handle = createSecurityHeadersHandle({
			trustForwardedProto: true,
			trustedProxyIps: ['fe80::1']
		});

		const response = await handle({
			event: {
				request: new Request('http://kaivalo.test/', {
					method: 'GET',
					headers: { 'x-forwarded-proto': 'https' }
				}),
				url: new URL('http://kaivalo.test/'),
				getClientAddress: () => '[fe80::1%eth0]'
			} as never,
			resolve: async () => new Response('ok', { status: 200 })
		});

		expect(response.headers.get('Strict-Transport-Security')).toBe(
			'max-age=63072000; includeSubDomains'
		);
	});

	it('uses the trusted proxy proto hop from the right side of comma-separated values', async () => {
		const handle = createSecurityHeadersHandle({
			trustForwardedProto: true,
			trustedProxyIps: ['127.0.0.1']
		});

		const httpsFromTrustedProxy = await handle({
			event: {
				request: new Request('http://kaivalo.test/', {
					method: 'GET',
					headers: { 'x-forwarded-proto': 'http, https' }
				}),
				url: new URL('http://kaivalo.test/'),
				getClientAddress: () => '127.0.0.1'
			} as never,
			resolve: async () => new Response('ok', { status: 200 })
		});

		expect(httpsFromTrustedProxy.headers.get('Strict-Transport-Security')).toBe(
			'max-age=63072000; includeSubDomains'
		);

		const httpFromTrustedProxy = await handle({
			event: {
				request: new Request('http://kaivalo.test/', {
					method: 'GET',
					headers: { 'x-forwarded-proto': 'https, http' }
				}),
				url: new URL('http://kaivalo.test/'),
				getClientAddress: () => '127.0.0.1'
			} as never,
			resolve: async () => new Response('ok', { status: 200 })
		});

		expect(
			httpFromTrustedProxy.headers.get('Strict-Transport-Security')
		).toBeNull();
	});

	it('rejects malformed client addresses at the trust boundary', async () => {
		const handle = createSecurityHeadersHandle({
			trustForwardedProto: true,
			trustedProxyIps: ['fe80::1']
		});

		const response = await handle({
			event: {
				request: new Request('http://kaivalo.test/', {
					method: 'GET',
					headers: { 'x-forwarded-proto': 'https' }
				}),
				url: new URL('http://kaivalo.test/'),
				getClientAddress: () => '[fe80::1]junk'
			} as never,
			resolve: async () => new Response('ok', { status: 200 })
		});

		expect(response.headers.get('Strict-Transport-Security')).toBeNull();
	});
});
