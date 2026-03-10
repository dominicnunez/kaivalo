import { describe, expect, it } from 'vitest';
import {
	getLauncherServices,
	getMarketingServices,
	isTrustedServiceAppHostname,
	isTrustedServiceAppUrl
} from './registry.ts';

describe('service registry helpers', () => {
	it('returns the marketing catalog that should appear on the landing page', () => {
		expect(getMarketingServices().map((service) => service.id)).toEqual([
			'sweep',
			'podstudio'
		]);
	});

	it('groups launcher services by availability for authenticated users', () => {
		expect(getLauncherServices()).toMatchObject({
			activeServices: [{ id: 'sweep' }],
			plannedServices: [{ id: 'podstudio' }]
		});
	});

	it('returns defensive copies for marketing services', () => {
		const marketingServices = getMarketingServices();
		marketingServices[0].name = 'Changed in test';

		expect(getMarketingServices()[0]?.name).toBe('Sweep');
	});

	it('returns defensive copies for launcher services', () => {
		const { activeServices, plannedServices } = getLauncherServices();
		activeServices[0].enabled = false;
		plannedServices[0].name = 'Changed in test';

		const nextSnapshot = getLauncherServices();
		expect(nextSnapshot.activeServices[0]?.enabled).toBe(true);
		expect(nextSnapshot.plannedServices[0]?.name).toBe('PodStudio');
	});

	it('uses absolute https launcher urls on trusted Kaivalo hosts', () => {
		const launcherServices = getLauncherServices();
		const visibleServices = [
			...launcherServices.activeServices,
			...launcherServices.plannedServices
		];

		for (const service of visibleServices) {
			const parsed = new URL(service.appUrl);

			expect(parsed.protocol).toBe('https:');
			expect(parsed.username).toBe('');
			expect(parsed.password).toBe('');
			expect(parsed.port).toBe('');
			expect(parsed.search).toBe('');
			expect(parsed.hash).toBe('');
			expect(isTrustedServiceAppHostname(parsed.hostname)).toBe(true);
		}
	});

	it.each([
		'.kaivalo.com',
		'..kaivalo.com',
		'-bad.kaivalo.com',
		'bad-.kaivalo.com',
		'kaivalo.com',
		'evil-kaivalo.com'
	])('rejects malformed or untrusted service app hostname %s', (hostname) => {
		expect(isTrustedServiceAppHostname(hostname)).toBe(false);
	});

	it.each([
		'https://sweep.kaivalo.com:443',
		'https://sweep.kaivalo.com/launch',
		'https://sweep.kaivalo.com?tab=launcher',
		'https://sweep.kaivalo.com/#launcher',
		'https://user:s3cret@sweep.kaivalo.com',
		'https://-bad.kaivalo.com'
	])('rejects malformed or unsafe service app url %s', (appUrl) => {
		expect(isTrustedServiceAppUrl(appUrl)).toBe(false);
	});
});
