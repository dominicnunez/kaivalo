import { describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => ({
	mockEnv: {
		WORKOS_CLIENT_ID: 'client_123',
		WORKOS_API_KEY: 'sk_test_123',
		WORKOS_REDIRECT_URI: 'https://kaivalo.test/auth/callback',
		WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
		ORIGIN: 'https://kaivalo.test'
	} as Record<string, string>
}));

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

import { load } from './+page.server';

describe('home page load', () => {
	it('builds metadata from the validated public origin', () => {
		const result = load({} as never);

		expect(result).toEqual({
			meta: {
				title: 'Kaivalo | Tools That Solve Things',
				description:
					'Tools that cut through complexity. One account, all tools — sign up once and everything just works.',
				url: 'https://kaivalo.test',
				image: 'https://kaivalo.test/og-image.png',
				imageAlt: 'Kaivalo — tools that cut through complexity',
				twitterCard: 'summary_large_image'
			}
		});
	});
});
