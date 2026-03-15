import { describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { AUTH_ERROR_MESSAGE } from '$lib/auth/auth-error-query-shared.ts';

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

function createSingleAssignmentSetHeaders(
	initialHeaders: Record<string, string> = {}
) {
	const assignedHeaders = new Map(
		Object.entries(initialHeaders).map(([name, value]) => [
			name.toLowerCase(),
			value
		])
	);

	return vi.fn((headers: Record<string, string>) => {
		for (const [name, value] of Object.entries(headers)) {
			const normalizedName = name.toLowerCase();
			if (assignedHeaders.has(normalizedName)) {
				throw new Error(`"${normalizedName}" header is already set`);
			}
			assignedHeaders.set(normalizedName, value);
		}
	});
}

describe('services page load', () => {
	it('redirects unauthenticated users to the trusted sign-in flow', async () => {
		const setHeaders = createSingleAssignmentSetHeaders({
			vary: 'Cookie'
		});
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

	it('fails with a controlled error when auth is unavailable even if sign-in remains configured', async () => {
		const setHeaders = createSingleAssignmentSetHeaders({
			'cache-control': 'private, no-store',
			vary: 'Cookie, Authorization'
		});

		await expect(
			load({
				parent: async () =>
					createParentData({
						user: null,
						signInUrl: '/auth/sign-in',
						authError: {
							message: AUTH_ERROR_MESSAGE,
							incidentId: 'authlayout_test-incident'
						}
					}),
				setHeaders
			} as never)
		).rejects.toMatchObject({
			status: 503,
			body: {
				message: AUTH_ERROR_MESSAGE,
				incidentId: 'authlayout_test-incident'
			}
		});

		expect(setHeaders).not.toHaveBeenCalled();
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
				message: AUTH_ERROR_MESSAGE
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
