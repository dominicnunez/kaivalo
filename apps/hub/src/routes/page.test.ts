import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { PageData } from './$types';

const currentYear = String(new Date().getFullYear());
const matchMediaStub = vi.fn().mockImplementation(() => ({
	matches: false,
	addEventListener: vi.fn(),
	removeEventListener: vi.fn()
}));

function createPageData(overrides: Partial<PageData> = {}): PageData {
	return {
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
		authError: null,
		...overrides
	};
}

function renderPage(overrides: Partial<PageData> = {}) {
	return render(Page, {
		data: createPageData(overrides)
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

	it('renders signed-in controls with the user profile image and sign-out action', () => {
		const { container } = renderPage({
			user: {
				firstName: 'Kai',
				email: 'kai@example.com',
				profilePictureUrl: 'https://avatars.githubusercontent.com/u/1'
			}
		});

		const signOutForm = container.querySelector(
			'form[action="/auth/sign-out"]'
		);
		expect(signOutForm).not.toBeNull();
		const controls = signOutForm?.parentElement;
		expect(controls).not.toBeNull();
		expect(
			within(controls as HTMLElement).getByRole('img', { name: 'Kai' })
		).toBeTruthy();
		expect(within(controls as HTMLElement).getByText('Kai')).toBeTruthy();
		expect(
			within(signOutForm as HTMLFormElement).getByRole('button', {
				name: /sign out/i
			})
		).toBeTruthy();
		expect(
			within(controls as HTMLElement).queryByRole('link', { name: /sign in/i })
		).toBeNull();
	});

	it('renders fallback identity controls when the user has no profile image', () => {
		const { container } = renderPage({
			user: {
				firstName: null,
				email: 'kai@example.com',
				profilePictureUrl: null
			}
		});

		const signOutForm = container.querySelector(
			'form[action="/auth/sign-out"]'
		);
		expect(signOutForm).not.toBeNull();
		const controls = signOutForm?.parentElement;
		expect(controls).not.toBeNull();
		expect(
			within(controls as HTMLElement).queryByRole('img', { name: /kai/i })
		).toBeNull();
		expect(
			within(controls as HTMLElement).getByText('kai@example.com')
		).toBeTruthy();
		expect(within(controls as HTMLElement).getByText('K')).toBeTruthy();
	});

	it('renders a disabled fallback control when sign-in is unavailable', () => {
		renderPage({
			signInUrl: null,
			authError: {
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: 'authlayout_123'
			}
		});

		const button = screen.getByRole('button', {
			name: /sign in unavailable/i
		});
		expect(button.getAttribute('disabled')).toBe('');
		expect(button.getAttribute('title')).toBe(
			'Sign-in is temporarily unavailable'
		);
	});
});
