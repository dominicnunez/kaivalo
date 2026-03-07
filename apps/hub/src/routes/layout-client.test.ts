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
			'https://kaivalo.test/dashboard?error=auth&incident=test-123&next=1#services'
		);
	});

	it('does not render spoofed incident identifiers from query string', () => {
		render(Layout, {
			data: {
				user: null,
				signInUrl: '/auth/sign-in',
				authError: null
			},
			children: snippet
		});

		expect(screen.queryByText(/\(ref /)).toBeNull();
	});

	it('renders trusted auth incident identifiers from query string', () => {
		mockPage.url = new URL(
			'https://kaivalo.test/dashboard?error=auth&incident=authcb_123e4567-e89b-12d3-a456-426614174000'
		);

		render(Layout, {
			data: {
				user: null,
				signInUrl: '/auth/sign-in',
				authError: null
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
				authError: null
			},
			children: snippet
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

		expect(mockGoto).toHaveBeenCalledWith('/dashboard?next=1#services', {
			replaceState: true
		});
	});
});
