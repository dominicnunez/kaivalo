import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';

vi.mock('lucide-svelte', async () => {
	const { default: IconStub } =
		await import('../../test-support/IconStub.svelte');

	return {
		Calendar: IconStub,
		ExternalLink: IconStub,
		LayoutDashboard: IconStub,
		LogIn: IconStub,
		LogOut: IconStub,
		Mail: IconStub,
		Mic: IconStub
	};
});

import Page from './+page.svelte';
import type { PageData } from './$types';

afterEach(() => {
	vi.useRealTimers();
});

function createPageData(overrides: Partial<PageData> = {}): PageData {
	return {
		meta: {
			title: 'Kaivalo | Services',
			description: 'Launcher test description'
		},
		currentYear: new Date().getFullYear(),
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
				lifecycle: 'active',
				marketingVisible: true,
				launcherVisible: true,
				enabled: true,
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
				lifecycle: 'planned',
				marketingVisible: true,
				launcherVisible: true,
				enabled: false,
				appUrl: 'https://podcast.kaivalo.com'
			}
		],
		...overrides
	};
}

describe('services page content', () => {
	it('renders active services with launch actions', () => {
		render(Page, {
			data: createPageData()
		});

		const activeSection = screen.getByTestId('active-services');
		expect(
			within(activeSection).getByRole('heading', { name: 'Available' })
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
		const { container } = render(Page, {
			data: createPageData()
		});

		const signOutForm = container.querySelector(
			'form[action="/auth/sign-out"]'
		);
		expect(signOutForm).not.toBeNull();
		const controls = signOutForm?.parentElement;
		expect(controls).not.toBeNull();
		expect(within(controls as HTMLElement).getByText('Kai')).toBeTruthy();
		expect(within(controls as HTMLElement).getByText('K')).toBeTruthy();
		expect(
			within(controls as HTMLElement).getByRole('button', {
				name: /sign out/i
			})
		).toBeTruthy();
		expect(
			screen.getByRole('heading', {
				name: /tools dashboard/i
			})
		).toBeTruthy();
		expect(
			screen.getByText(
				/services linked to your kaivalo account live here first/i
			)
		).toBeTruthy();
	});

	it('refreshes the footer year at midnight without a reload', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2025-12-31T23:59:59.500'));

		const { container } = render(Page, {
			data: createPageData({
				currentYear: 2025
			})
		});

		expect(
			within(container.querySelector('footer') as HTMLElement).getByText(
				'© 2025'
			)
		).toBeTruthy();

		await vi.advanceTimersByTimeAsync(500);
		await tick();
		expect(
			within(container.querySelector('footer') as HTMLElement).getByText(
				'© 2026'
			)
		).toBeTruthy();
	});
});
