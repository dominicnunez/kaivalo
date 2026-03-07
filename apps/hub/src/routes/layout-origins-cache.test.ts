import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetValidatedWorkosEnv, mockGetUser, mockGetSignInUrl } = vi.hoisted(
	() => ({
		mockGetValidatedWorkosEnv: vi.fn(() => ({
			origin: 'https://kaivalo.test',
			redirectUri: 'https://kaivalo.test/auth/callback'
		})),
		mockGetUser: vi.fn(),
		mockGetSignInUrl: vi.fn()
	})
);

vi.mock('$lib/server/workos-security.js', () => ({
	getValidatedWorkosEnv: mockGetValidatedWorkosEnv
}));

vi.mock('@workos/authkit-sveltekit', () => ({
	authKit: {
		getUser: mockGetUser,
		getSignInUrl: mockGetSignInUrl
	}
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		NODE_ENV: 'test',
		KAIVALO_ENABLE_TEST_AUTH_FAILURE: '0'
	}
}));

function createEvent(origin: string) {
	return {
		url: new URL(origin),
		request: new Request(origin)
	} as never;
}

async function loadWithFreshModule() {
	vi.resetModules();
	const module = await import('./+layout.server');
	return module.load;
}

describe('layout trusted origin initialization', () => {
	beforeEach(() => {
		mockGetUser.mockReset();
		mockGetSignInUrl.mockReset();
		mockGetValidatedWorkosEnv.mockReset();
		mockGetValidatedWorkosEnv.mockReturnValue({
			origin: 'https://kaivalo.test',
			redirectUri: 'https://kaivalo.test/auth/callback'
		} as never);
		mockGetUser.mockResolvedValue(null as never);
		mockGetSignInUrl.mockResolvedValue('/auth/sign-in' as never);
	});

	it('validates WorkOS env once and reuses trusted origins across requests', async () => {
		const load = await loadWithFreshModule();
		await load(createEvent('https://kaivalo.test/'));
		await load(createEvent('https://kaivalo.test/'));

		expect(mockGetValidatedWorkosEnv).toHaveBeenCalledTimes(1);
		expect(mockGetSignInUrl).toHaveBeenCalledTimes(2);
	});

	it('retries trusted origin initialization after an initial validation failure', async () => {
		mockGetValidatedWorkosEnv
			.mockImplementationOnce(() => {
				throw new Error('env unavailable during first request');
			})
			.mockReturnValue({
				origin: 'https://tenant.kaivalo.test',
				redirectUri: 'https://tenant.kaivalo.test/auth/callback'
			} as never);
		mockGetSignInUrl.mockResolvedValue(
			'https://tenant.kaivalo.test/auth/sign-in' as never
		);
		const load = await loadWithFreshModule();

		const firstResult = await load(createEvent('https://tenant.kaivalo.test/'));
		const secondResult = await load(
			createEvent('https://tenant.kaivalo.test/')
		);

		expect(firstResult).toEqual({
			user: null,
			signInUrl: null,
			authError: {
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId: null
			}
		});
		expect(secondResult).toEqual({
			user: null,
			signInUrl: '/auth/sign-in',
			authError: null
		});
		expect(mockGetValidatedWorkosEnv).toHaveBeenCalledTimes(2);
	});

	it('skips trusted origin initialization for authenticated requests', async () => {
		mockGetUser.mockResolvedValue({
			firstName: 'Kai',
			email: 'kai@example.com',
			profilePictureUrl: null
		} as never);
		const load = await loadWithFreshModule();

		const result = await load(createEvent('https://kaivalo.test/'));

		expect(result).toEqual({
			user: {
				firstName: 'Kai',
				email: 'kai@example.com',
				profilePictureUrl: null
			},
			signInUrl: null,
			authError: null
		});
		expect(mockGetSignInUrl).not.toHaveBeenCalled();
		expect(mockGetValidatedWorkosEnv).not.toHaveBeenCalled();
	});
});
