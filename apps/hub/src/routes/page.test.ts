import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, within } from '@testing-library/svelte';
import { tick } from 'svelte';

vi.mock('lucide-svelte', async () => {
	const { default: IconStub } = await import('../test-support/IconStub.svelte');

	return {
		Calendar: IconStub,
		ArrowRight: IconStub,
		LayoutDashboard: IconStub,
		Mail: IconStub,
		Mic: IconStub,
		LogIn: IconStub,
		LogOut: IconStub
	};
});

import Page from './+page.svelte';
import type { PageData } from './$types';

const currentYear = String(new Date().getFullYear());
const TYPEWRITER_TYPING_DELAY_MS = 100;
const TYPEWRITER_PAUSE_FULL_MS = 2000;
const TYPEWRITER_DELETE_DELAY_MS = 50;

function createMatchMediaController(matches = false) {
	const listeners = new Set<EventListenerOrEventListenerObject>();
	const state = { matches };
	const mediaQuery = {
		get matches() {
			return state.matches;
		},
		media: '(prefers-reduced-motion: reduce)',
		onchange: null,
		addEventListener: vi.fn(
			(_type: string, listener: EventListenerOrEventListenerObject) => {
				listeners.add(listener);
			}
		),
		removeEventListener: vi.fn(
			(_type: string, listener: EventListenerOrEventListenerObject) => {
				listeners.delete(listener);
			}
		),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		dispatchEvent: vi.fn()
	} as MediaQueryList;

	return {
		mediaQuery,
		setMatches(nextMatches: boolean) {
			state.matches = nextMatches;
			const event = { matches: nextMatches, media: mediaQuery.media };
			for (const listener of listeners) {
				if (typeof listener === 'function') {
					listener(event as MediaQueryListEvent);
					continue;
				}
				listener.handleEvent(event as MediaQueryListEvent);
			}
		}
	};
}

function getHeroTypewriterText(container: HTMLElement) {
	const subheadline =
		container.querySelector('.typewriter-cursor')?.parentElement;
	expect(subheadline).not.toBeNull();
	return subheadline?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

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
		currentYear: Number(currentYear),
		user: null,
		signInUrl: null,
		authError: null,
		marketingServices: [
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
		],
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
			value: vi
				.fn()
				.mockImplementation(() => createMatchMediaController().mediaQuery)
		});
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
			within(servicesSection as HTMLElement).getByText('Active')
		).toBeTruthy();
		expect(
			within(servicesSection as HTMLElement).getByRole('heading', {
				name: 'PodStudio'
			})
		).toBeTruthy();
		expect(
			within(servicesSection as HTMLElement)
				.getByRole('link', {
					name: /open from your services/i
				})
				.getAttribute('href')
		).toBe('/services');

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

	it('renders the shared footer mark and the current year', () => {
		const { container } = renderPage();

		const footer = container.querySelector('footer');
		expect(footer).not.toBeNull();
		expect(
			within(footer as HTMLElement).getByText(`© ${currentYear}`)
		).toBeTruthy();
		expect(within(footer as HTMLElement).getByText('Kaivalo')).toBeTruthy();
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
			within(controls as HTMLElement)
				.getByRole('link', {
					name: /open services/i
				})
				.getAttribute('href')
		).toBe('/services');
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
		const { container } = renderPage({
			signInUrl: null,
			authError: {
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: 'authlayout_123'
			}
		});

		const button = container.querySelector(
			'button[title="Sign-in is temporarily unavailable"]'
		);
		expect(button).not.toBeNull();
		const disabledButton = button as HTMLButtonElement;
		expect(disabledButton.getAttribute('disabled')).toBe('');
		expect(disabledButton.getAttribute('title')).toBe(
			'Sign-in is temporarily unavailable'
		);
	});
});

describe('home page client behavior', () => {
	let matchMediaController = createMatchMediaController();
	let documentVisibilityState = 'visible';

	beforeEach(() => {
		matchMediaController = createMatchMediaController();
		documentVisibilityState = 'visible';

		Object.defineProperty(window, 'matchMedia', {
			writable: true,
			value: vi.fn().mockImplementation(() => matchMediaController.mediaQuery)
		});
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => documentVisibilityState
		});
	});

	afterEach(() => {
		cleanup();
		if (vi.isFakeTimers()) {
			vi.runOnlyPendingTimers();
			vi.useRealTimers();
		}
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('renders the full first phrase immediately when reduced motion is preferred', async () => {
		matchMediaController = createMatchMediaController(true);
		window.matchMedia = vi
			.fn()
			.mockImplementation(() => matchMediaController.mediaQuery);

		const { container } = renderPage();

		await tick();

		expect(getHeroTypewriterText(container)).toContain(
			'Making chimney cleaning|simple.'
		);
	});

	it('pauses the typewriter while the page is hidden and resumes when visible again', async () => {
		vi.useFakeTimers();
		const { container } = renderPage();

		await vi.advanceTimersByTimeAsync(TYPEWRITER_TYPING_DELAY_MS);
		await tick();
		const visibleText = getHeroTypewriterText(container);
		expect(visibleText).toContain('Making ch|simple.');

		documentVisibilityState = 'hidden';
		document.dispatchEvent(new Event('visibilitychange'));
		await vi.advanceTimersByTimeAsync(
			TYPEWRITER_PAUSE_FULL_MS + TYPEWRITER_DELETE_DELAY_MS * 4
		);
		expect(getHeroTypewriterText(container)).toBe(visibleText);

		documentVisibilityState = 'visible';
		document.dispatchEvent(new Event('visibilitychange'));
		await vi.advanceTimersByTimeAsync(TYPEWRITER_TYPING_DELAY_MS);
		await tick();
		expect(getHeroTypewriterText(container)).toContain('Making ch|simple.');
	});

	it('refreshes the footer year at midnight', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2025-12-31T23:59:59.500'));
		window.matchMedia = vi
			.fn()
			.mockImplementation(() => matchMediaController.mediaQuery);

		const { container } = renderPage({
			currentYear: 2025
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
