import { describe, expect, it } from 'vitest';
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
						signInUrl: 'https://api.workos.com/user_management/authorize'
					})
			} as never);
			expect.unreachable('expected redirect');
		} catch (caught) {
			expect(isRedirect(caught)).toBe(true);
			if (!isRedirect(caught)) {
				return;
			}
			expect(caught.status).toBe(303);
			expect(caught.location).toBe(
				'https://api.workos.com/user_management/authorize'
			);
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

	it('returns active and planned services for authenticated users', async () => {
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
		expect(result.currentYear).toBe(new Date().getFullYear());
		expect(result.activeServices.map((service) => service.id)).toEqual([
			'sweep'
		]);
		expect(result.plannedServices.map((service) => service.id)).toEqual([
			'podstudio'
		]);
	});
});
