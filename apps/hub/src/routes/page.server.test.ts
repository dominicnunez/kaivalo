import { describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => ({
	mockEnv: {
		WORKOS_CLIENT_ID: 'client_123',
		WORKOS_API_KEY: 'sk_test_123',
		WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
		WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
		AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
		ORIGIN: 'https://kaivalo.test'
	} as Record<string, string>
}));

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

import { load } from './+page.server';

describe('home page load', () => {
	it('uses the validated origin, current year, and marketing registry output', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2030-07-04T12:00:00Z'));
		const originalOrigin = mockEnv.ORIGIN;
		mockEnv.ORIGIN = 'https://kaivalo.test/';
		try {
			const result = load({} as never) as {
				meta: {
					url: string;
					image: string;
				};
				currentYear: number;
				marketingServices: Array<{
					id: string;
					name: string;
					tagline: string;
					description: string;
					icon: string;
					lifecycle: string;
					marketingVisible: boolean;
					launcherVisible: boolean;
					enabled: boolean;
					appUrl: string;
				}>;
			};

			expect(result.meta.url).toBe('https://kaivalo.test');
			expect(result.meta.image).toBe('https://kaivalo.test/og-image.png');
			expect(result.currentYear).toBe(2030);
			expect(result.marketingServices).toEqual([
				{
					id: 'sweep',
					name: 'Sweep',
					tagline: 'Stay on schedule',
					description: 'Smart scheduling for chimney professionals.',
					icon: 'calendar',
					lifecycle: 'active',
					marketingVisible: true,
					launcherVisible: true,
					enabled: true,
					appUrl: 'https://sweep.kaivalo.com'
				},
				{
					id: 'podstudio',
					name: 'PodStudio',
					tagline: 'Podcast management',
					description:
						'Equipment tracking and session scheduling for podcast studios.',
					icon: 'mic',
					lifecycle: 'planned',
					marketingVisible: true,
					launcherVisible: true,
					enabled: false,
					appUrl: 'https://podcast.kaivalo.com'
				}
			]);
		} finally {
			mockEnv.ORIGIN = originalOrigin;
			vi.useRealTimers();
		}
	});
});
