import { authKit } from '@workos/authkit-sveltekit';
import { env } from '$env/dynamic/private';
import { randomUUID } from 'node:crypto';
import type { LayoutServerLoad } from './$types';
import { getValidatedWorkosEnv } from '$lib/server/workos-security.js';
import { getErrorName, normalizeRequestId } from '$lib/auth/log-context.js';
import { TRUSTED_AVATAR_HOSTS } from '$lib/server/trusted-hosts.js';

const TRUSTED_AVATAR_HOSTNAME_SET = new Set(TRUSTED_AVATAR_HOSTS);
const TRUSTED_SIGN_IN_ORIGINS = new Set(['https://api.workos.com']);
const TRUSTED_SIGN_IN_PATH_PREFIXES = [
	'/auth/sign-in',
	'/user_management/authorize'
];
let trustedSignInOriginSetCache: Set<string> | null = null;

function getTrustedSignInOriginSet(): Set<string> {
	if (trustedSignInOriginSetCache) {
		return trustedSignInOriginSetCache;
	}

	const trustedOrigins = new Set(TRUSTED_SIGN_IN_ORIGINS);
	try {
		const workosEnv = getValidatedWorkosEnv(env);
		trustedOrigins.add(workosEnv.origin);
		trustedOrigins.add(new URL(workosEnv.redirectUri).origin);
		trustedSignInOriginSetCache = trustedOrigins;
	} catch {
		// Build-time route analysis can evaluate this module before runtime env is injected.
		// Do not cache failures so later requests can recover once runtime env is available.
	}

	return trustedOrigins;
}

function isTrustedAvatarHost(hostname: string): boolean {
	return TRUSTED_AVATAR_HOSTNAME_SET.has(hostname);
}

function sanitizeAvatarUrl(
	candidate: string | null | undefined
): string | null {
	if (!candidate) {
		return null;
	}

	try {
		const parsed = new URL(candidate);
		if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
			return null;
		}

		return isTrustedAvatarHost(parsed.hostname) ? parsed.toString() : null;
	} catch {
		return null;
	}
}

function sanitizeSignInUrl(
	candidate: string | null | undefined,
	eventOrigin: string,
	trustedOrigins: Set<string>
): string | null {
	if (!candidate) {
		return null;
	}

	if (candidate.startsWith('/')) {
		if (candidate.startsWith('//')) {
			return null;
		}

		const parsedRelativeUrl = new URL(candidate, eventOrigin);
		return isTrustedSignInPath(parsedRelativeUrl.pathname)
			? parsedRelativeUrl.pathname +
					parsedRelativeUrl.search +
					parsedRelativeUrl.hash
			: null;
	}

	try {
		const parsed = new URL(candidate);
		if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
			return null;
		}

		if (!trustedOrigins.has(parsed.origin)) {
			return null;
		}

		if (!isTrustedSignInPath(parsed.pathname)) {
			return null;
		}

		const eventOriginUrl = new URL(eventOrigin);
		if (parsed.origin === eventOriginUrl.origin) {
			return parsed.pathname + parsed.search + parsed.hash;
		}

		return parsed.toString();
	} catch {
		return null;
	}
}

function isTrustedSignInPath(pathname: string): boolean {
	return TRUSTED_SIGN_IN_PATH_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
	);
}

function shouldForceAuthFailure(
	event: Parameters<LayoutServerLoad>[0]
): boolean {
	return (
		env.NODE_ENV === 'test' &&
		env.KAIVALO_ENABLE_TEST_AUTH_FAILURE === '1' &&
		event.request.headers.get('x-kaivalo-test-auth-failure') === '1'
	);
}

function markAuthFailureNoStore(event: Parameters<LayoutServerLoad>[0]): void {
	if (typeof event.setHeaders !== 'function') {
		return;
	}

	event.setHeaders({
		'cache-control': 'private, no-store',
		vary: 'Cookie, Authorization'
	});
}

export const load: LayoutServerLoad = async (event) => {
	try {
		if (shouldForceAuthFailure(event)) {
			throw new Error('Forced auth failure for integration test');
		}

		const user = await authKit.getUser(event);
		let signInUrl = null;
		if (!user) {
			const trustedSignInOrigins = getTrustedSignInOriginSet();
			signInUrl = sanitizeSignInUrl(
				await authKit.getSignInUrl(),
				event.url.origin,
				trustedSignInOrigins
			);
		}
		const authError =
			user || signInUrl
				? null
				: {
						message:
							'Sign-in is temporarily unavailable. Please try again shortly.',
						incidentId: null
					};
		if (authError) {
			markAuthFailureNoStore(event);
		}

		return {
			user: user
				? {
						firstName: user.firstName,
						email: user.email,
						profilePictureUrl: sanitizeAvatarUrl(user.profilePictureUrl)
					}
				: null,
			signInUrl: user ? null : signInUrl,
			authError
		};
	} catch (err) {
		const incidentId = `authlayout_${randomUUID()}`;
		const requestId = normalizeRequestId(
			event.request.headers.get('x-request-id')
		);
		console.error('Auth layout load failed', {
			requestId,
			incidentId,
			pathname: event.url.pathname,
			method: event.request.method,
			errorName: getErrorName(err),
			errorCode: 'AUTH_LAYOUT_UNEXPECTED_FAILURE'
		});
		markAuthFailureNoStore(event);

		return {
			user: null,
			signInUrl: null,
			authError: {
				message:
					'Sign-in is temporarily unavailable. Please try again shortly.',
				incidentId
			}
		};
	}
};
