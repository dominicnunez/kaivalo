import { describe, expect, it } from 'vitest';
import { GET } from './healthz/+server';
import {
	HUB_HEALTH_BODY,
	HUB_HEALTH_CACHE_CONTROL,
	HUB_HEALTH_CONTENT_TYPE,
	HUB_HEALTH_STATUS_CODE
} from '$lib/server/health-contract';

describe('healthz route', () => {
	it('returns a no-store plain-text ok response', async () => {
		const response = await GET();

		expect(response.status).toBe(HUB_HEALTH_STATUS_CODE);
		expect(response.headers.get('cache-control')).toBe(
			HUB_HEALTH_CACHE_CONTROL
		);
		expect(response.headers.get('content-type')).toBe(HUB_HEALTH_CONTENT_TYPE);
		await expect(response.text()).resolves.toBe(HUB_HEALTH_BODY);
	});
});
