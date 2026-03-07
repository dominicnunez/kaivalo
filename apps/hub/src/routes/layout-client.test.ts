import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Layout from './+layout.svelte';

const { mockGoto, mockPage } = vi.hoisted(() => ({
	mockGoto: vi.fn(),
	mockPage: {
		url: new URL('https://kaivalo.test/')
	}
}));

vi.mock('$app/navigation', () => ({
	goto: mockGoto
}));

vi.mock('$app/state', () => ({
	page: mockPage
}));

const snippet = createRawSnippet(() => ({
	render: () => '<span>Page content</span>'
}));

describe('layout client behavior', () => {
	beforeEach(() => {
		mockGoto.mockClear();
		mockPage.url = new URL(
			'https://kaivalo.test/dashboard?error=auth&incident=test-123&sig=forged&next=1#services'
		);
	});

	it('does not render auth errors from untrusted query parameters', () => {
		render(Layout, {
			data: {
				user: null,
				signInUrl: '/auth/sign-in',
				authError: null
			},
			children: snippet
		});

		expect(
			screen.queryByText(
				'Sign-in is temporarily unavailable. Please try again shortly.'
			)
		).toBeNull();
	});

	it('renders trusted auth incident identifiers from server data', () => {
		render(Layout, {
			data: {
				user: null,
				signInUrl: '/auth/sign-in',
				authError: {
					message:
						'Sign-in is temporarily unavailable. Please try again shortly.',
					incidentId: 'authcb_123e4567-e89b-12d3-a456-426614174000'
				}
			},
			children: snippet
		});

		expect(
			screen.getByText('(ref authcb_123e4567-e89b-12d3-a456-426614174000)')
		).toBeTruthy();
	});

	it('preserves hash fragments when dismissing auth query errors', async () => {
		render(Layout, {
			data: {
				user: null,
				signInUrl: '/auth/sign-in',
				authError: {
					message:
						'Sign-in is temporarily unavailable. Please try again shortly.',
					incidentId: 'authcb_123e4567-e89b-12d3-a456-426614174000'
				}
			},
			children: snippet
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

		expect(mockGoto).toHaveBeenCalledWith('/dashboard?next=1#services', {
			replaceState: true
		});
	});
});
