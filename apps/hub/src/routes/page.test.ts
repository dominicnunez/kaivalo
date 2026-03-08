import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

const currentYear = String(new Date().getFullYear());
const matchMediaStub = vi.fn().mockImplementation(() => ({
	matches: false,
	addEventListener: vi.fn(),
	removeEventListener: vi.fn()
}));

function renderPage() {
	return render(Page, {
		data: {
			meta: {
				title: 'Kaivalo | Tools That Solve Things',
				description: 'Test description',
				url: 'https://kaivalo.test',
				image: 'https://kaivalo.test/og-image.png',
				imageAlt: 'Kaivalo test image',
				twitterCard: 'summary_large_image'
			},
			user: null,
			signInUrl: null,
			authError: null
		}
	});
}

describe('home page content', () => {
	beforeEach(() => {
		Object.defineProperty(window, 'matchMedia', {
			writable: true,
			value: matchMediaStub
		});
		matchMediaStub.mockClear();
	});

	it('renders targetable service and philosophy sections with real content', () => {
		const { container } = renderPage();

		const servicesSection = container.querySelector('#services');
		expect(servicesSection).not.toBeNull();
		expect(
			within(servicesSection as HTMLElement).getByRole('heading', {
				name: 'Coming soon...'
			})
		).toBeTruthy();
		expect(
			within(servicesSection as HTMLElement).getByRole('heading', {
				name: 'Sweep'
			})
		).toBeTruthy();
		expect(
			within(servicesSection as HTMLElement).getByRole('heading', {
				name: 'PodStudio'
			})
		).toBeTruthy();
		expect(
			within(servicesSection as HTMLElement).queryAllByRole('link')
		).toHaveLength(0);

		const aboutSection = container.querySelector('#about');
		expect(aboutSection).not.toBeNull();
		expect(
			within(aboutSection as HTMLElement).getByRole('heading', {
				name: 'Philosophy'
			})
		).toBeTruthy();
		expect(
			within(aboutSection as HTMLElement).getByText(
				/Information asymmetry is a solvable problem/i
			)
		).toBeTruthy();
		expect(
			within(aboutSection as HTMLElement).getByText(/One account, all tools/i)
		).toBeTruthy();
	});

	it('renders footer contact information and the current year', () => {
		const { container } = renderPage();

		const footer = container.querySelector('footer');
		expect(footer).not.toBeNull();
		expect(
			within(footer as HTMLElement).getByText(`© ${currentYear}`)
		).toBeTruthy();

		const contactLink = screen.getByRole('link', { name: /contact/i });
		expect(contactLink.getAttribute('href')).toBe('mailto:kaivalo@proton.me');
	});
});
