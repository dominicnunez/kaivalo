import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';

vi.mock('lucide-svelte', async () => {
	const { default: IconStub } =
		await import('../../test-support/IconStub.svelte');

	return {
		Calendar: IconStub,
		ExternalLink: IconStub,
		LogOut: IconStub,
		Mic: IconStub
	};
});

import Page from './+page.svelte';
import type { PageData } from './$types';

function createPageData(overrides: Partial<PageData> = {}): PageData {
	return {
		meta: {
			title: 'Kaivalo | Service Launcher',
			description: 'Launcher test description'
		},
		user: {
			firstName: 'Kai',
			email: 'kai@example.com',
			profilePictureUrl: null
		},
		signInUrl: null,
		authError: null,
		activeServices: [
			{
				id: 'sweep',
				name: 'Sweep',
				tagline: 'Stay on schedule',
				description: 'Smart scheduling for chimney professionals.',
				icon: 'calendar',
				category: 'operations',
				lifecycle: 'active',
				marketingVisible: true,
				launcherVisible: true,
				requiresAuth: true,
				enabled: true,
				publicUrl: 'https://sweep.kaivalo.com',
				appUrl: 'https://sweep.kaivalo.com'
			}
		],
		plannedServices: [
			{
				id: 'podstudio',
				name: 'PodStudio',
				tagline: 'Podcast management',
				description:
					'Equipment tracking and session scheduling for podcast studios.',
				icon: 'mic',
				category: 'media',
				lifecycle: 'planned',
				marketingVisible: true,
				launcherVisible: true,
				requiresAuth: true,
				enabled: false,
				publicUrl: 'https://podcast.kaivalo.com',
				appUrl: 'https://podcast.kaivalo.com'
			}
		],
		...overrides
	};
}

describe('launcher page content', () => {
	it('renders active services with launch actions', () => {
		render(Page, {
			data: createPageData()
		});

		const activeSection = screen.getByTestId('active-services');
		expect(
			within(activeSection).getByRole('heading', { name: 'Available now' })
		).toBeTruthy();
		expect(
			within(activeSection).getByRole('heading', { name: 'Sweep' })
		).toBeTruthy();
		expect(
			within(activeSection)
				.getByRole('link', { name: /open sweep/i })
				.getAttribute('href')
		).toBe('https://sweep.kaivalo.com');
	});

	it('renders planned services without launch actions', () => {
		render(Page, {
			data: createPageData()
		});

		const plannedSection = screen.getByTestId('planned-services');
		expect(
			within(plannedSection).getByRole('heading', { name: 'Planned' })
		).toBeTruthy();
		expect(
			within(plannedSection).getByRole('heading', { name: 'PodStudio' })
		).toBeTruthy();
		expect(
			within(plannedSection).queryByRole('link', { name: /open podstudio/i })
		).toBeNull();
		expect(within(plannedSection).getByText(/coming soon/i)).toBeTruthy();
	});

	it('renders the signed-in identity context and sign-out action', () => {
		render(Page, {
			data: createPageData()
		});

		expect(screen.getByText(/signed in as kai/i)).toBeTruthy();
		expect(
			screen.getByRole('button', {
				name: /sign out/i
			})
		).toBeTruthy();
	});
});
