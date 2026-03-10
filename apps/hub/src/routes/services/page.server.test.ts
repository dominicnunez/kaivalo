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
		const setHeaders = vi.fn();
		try {
			await load({
				parent: async () =>
					createParentData({
						user: null,
						signInUrl: '/auth/sign-in'
					}),
				setHeaders
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
		expect(setHeaders).toHaveBeenCalledWith({
			'cache-control': 'private, no-store'
		});
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

	it('returns the current year and launcher registry output for authenticated users', async () => {
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
			expect(result.activeServices).toHaveLength(1);
			expect(result.activeServices.map((service) => service.id)).toEqual([
				'sweep'
			]);
			expect(result.plannedServices).toHaveLength(1);
			expect(result.plannedServices.map((service) => service.id)).toEqual([
				'podstudio'
			]);
		} finally {
			vi.useRealTimers();
		}
	});
});
