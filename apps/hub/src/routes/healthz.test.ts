import { describe, expect, it } from 'vitest';
import { GET } from './healthz/+server';

describe('healthz route', () => {
	it('returns a no-store plain-text ok response', async () => {
		const response = await GET();

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('content-type')).toContain('text/plain');
		await expect(response.text()).resolves.toBe('ok');
	});
});
