import { describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

import { load } from './+page.server';

function createParentData(overrides: Record<string, unknown> = {}) {
	return {
		user: {
			firstName: 'Kai',
			email: 'kai@example.com',
			profilePictureUrl: null
		},
		signInUrl: null,
		authError: null,
		...overrides
	};
}

describe('services page load', () => {
	it('redirects unauthenticated users to the trusted sign-in flow', async () => {
		try {
			await load({
				parent: async () =>
					createParentData({
						user: null,
						signInUrl: '/auth/sign-in'
					})
			} as never);
			expect.unreachable('expected redirect');
		} catch (caught) {
			expect(isRedirect(caught)).toBe(true);
			if (!isRedirect(caught)) {
				return;
			}
			expect(caught.status).toBe(303);
			expect(caught.location).toBe('/auth/sign-in');
		}
	});

	it('fails with a controlled error when sign-in is unavailable', async () => {
		await expect(
			load({
				parent: async () =>
					createParentData({
						user: null,
						signInUrl: null
					})
			} as never)
		).rejects.toMatchObject({
			status: 503,
			body: {
				message: 'Sign-in is temporarily unavailable.'
			}
		});
	});

	it('returns active and planned services from the real launcher registry', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2031-01-15T12:00:00Z'));
		try {
			const result = (await load({
				parent: async () => createParentData()
			} as never)) as {
				meta: {
					title: string;
					description: string;
				};
				currentYear: number;
				activeServices: Array<{ id: string }>;
				plannedServices: Array<{ id: string }>;
			};

			expect(result.meta).toEqual({
				title: 'Kaivalo | Services',
				description:
					'Open the Kaivalo services available on your account from one authenticated launcher.'
			});
			expect(result.currentYear).toBe(2031);
			expect(result.activeServices).toEqual([
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
				}
			]);
			expect(result.plannedServices).toEqual([
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
			vi.useRealTimers();
		}
	});
});
