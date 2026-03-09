import { describe, expect, it } from 'vitest';
import { getLauncherServices, getMarketingServices } from './registry.ts';

describe('service registry helpers', () => {
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
});
