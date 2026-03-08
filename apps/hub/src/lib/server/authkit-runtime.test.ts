import { describe, expect, it, vi } from 'vitest';

const { handleCallback, signOut } = vi.hoisted(() => ({
	handleCallback: vi.fn(),
	signOut: vi.fn()
}));

vi.mock('@workos/authkit-sveltekit', () => ({
	authKit: {
		handleCallback,
		signOut
	}
}));

import { getAuthRouteHandlers } from './authkit-runtime';

describe('getAuthRouteHandlers', () => {
	it('always returns the shipped WorkOS handlers', () => {
		expect(getAuthRouteHandlers()).toEqual({
			handleCallback,
			signOut
		});
	});
});
