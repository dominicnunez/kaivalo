import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPage } = vi.hoisted(() => ({
	mockPage: {
		status: 500,
		error: null as { message?: string; incidentId?: string } | null
	}
}));

vi.mock('$app/state', () => ({
	page: mockPage
}));

import ErrorPage from './+error.svelte';

describe('error page rendering', () => {
	beforeEach(() => {
		mockPage.status = 500;
		mockPage.error = null;
	});

	it('renders not found copy for 404 responses', () => {
		mockPage.status = 404;

		render(ErrorPage);

		expect(
			screen.getByRole('heading', { name: 'Something went wrong' })
		).toBeTruthy();
		expect(
			screen.getByText("The page you're looking for doesn't exist.")
		).toBeTruthy();
		expect(screen.queryByText(/^Reference:/)).toBeNull();
	});

	it('renders generic failure copy and incident references for other errors', () => {
		mockPage.status = 500;
		mockPage.error = {
			message: 'unexpected failure',
			incidentId: 'hook_123e4567-e89b-12d3-a456-426614174000'
		};

		render(ErrorPage);

		expect(
			screen.getByText('An unexpected error occurred. Please try again.')
		).toBeTruthy();
		expect(
			screen.getByText('Reference: hook_123e4567-e89b-12d3-a456-426614174000')
		).toBeTruthy();
	});
});
