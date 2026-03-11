import { describe, expect, it } from 'vitest';
import {
	getBrowserNavigationProbeHeaders,
	isBrowserNavigationRequest,
	normalizeConfiguredOrigin
} from './request-policy.ts';

describe('auth request policy', () => {
	it('normalizes configured origins and rejects non-origin values', () => {
		expect(normalizeConfiguredOrigin('https://kaivalo.test/')).toBe(
			'https://kaivalo.test'
		);
		expect(() =>
			normalizeConfiguredOrigin('https://user:pass@kaivalo.test')
		).toThrow(/expectedOrigin must be a valid URL origin/);
		expect(() =>
			normalizeConfiguredOrigin('https://kaivalo.test/path', 'DEPLOY_ORIGIN')
		).toThrow(/DEPLOY_ORIGIN must be a valid URL origin/);
	});

	it('classifies browser navigation requests from fetch metadata or html accept headers', () => {
		expect(
			isBrowserNavigationRequest(
				new Request('https://kaivalo.test/auth/sign-in', {
					headers: {
						'sec-fetch-mode': 'navigate'
					}
				})
			)
		).toBe(true);
		expect(
			isBrowserNavigationRequest(
				new Request('https://kaivalo.test/auth/sign-in', {
					headers: {
						'sec-fetch-dest': 'document'
					}
				})
			)
		).toBe(true);
		expect(
			isBrowserNavigationRequest(
				new Request('https://kaivalo.test/auth/sign-in', {
					headers: {
						accept: 'text/html'
					}
				})
			)
		).toBe(true);
		expect(
			isBrowserNavigationRequest(
				new Request('https://kaivalo.test/auth/sign-in', {
					headers: {
						accept: 'text/html,application/json'
					}
				})
			)
		).toBe(false);
	});

	it('provides browser probe headers that match the navigation contract', () => {
		expect(getBrowserNavigationProbeHeaders()).toEqual({
			accept: 'text/html',
			'sec-fetch-mode': 'navigate'
		});
	});
});
