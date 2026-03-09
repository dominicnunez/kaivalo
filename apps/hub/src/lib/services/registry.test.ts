import { describe, expect, it } from 'vitest';
import { getLauncherServices, getMarketingServices } from './registry.ts';

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
			expect(parsed.hostname.endsWith('.kaivalo.com')).toBe(true);
		}
	});
});
