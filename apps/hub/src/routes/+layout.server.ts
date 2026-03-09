import { env } from '$env/dynamic/private';
import { randomUUID } from 'node:crypto';
import type { LayoutServerLoad } from './$types';
import { getValidatedWorkosEnv } from '$lib/server/workos-security.ts';
import {
	getErrorLogContext,
	shouldIncludeErrorMessage
} from '$lib/server/error-diagnostics.ts';
import { normalizeRequestId } from '$lib/auth/log-context.ts';
import {
	AUTH_ERROR_MESSAGE,
	readVerifiedAuthError
} from '$lib/auth/auth-error-query.ts';
import { normalizeTrustedRedirectLocation } from '$lib/auth/safe-redirect.ts';
import { isTrustedAvatarHost } from '$lib/server/trusted-hosts.ts';
import { getTrustedAuthOriginSet } from '$lib/server/auth-origin-policy.ts';
import { isLoopbackIpAddress } from '$lib/server/ip-address.ts';
import { authKit } from '@workos/authkit-sveltekit';

const TRUSTED_SIGN_IN_PATH_PREFIXES = [
	'/auth/sign-in',
	'/user_management/authorize'
];
const DEV_AUTH_BYPASS_EMAIL = 'dev@kaivalo.local';
const DEV_AUTH_BYPASS_FIRST_NAME = 'Dev';
let trustedSignInOriginSetCache: Set<string> | null = null;
let trustedSignInOriginCacheKey: string | null = null;

function isLoopbackHostname(hostname: string): boolean {
	const normalizedHostname = hostname.trim().toLowerCase();
	if (!normalizedHostname) {
		return false;
	}

	return (
		normalizedHostname === 'localhost' ||
		normalizedHostname.endsWith('.localhost') ||
		isLoopbackIpAddress(normalizedHostname)
	);
}

function isLoopbackOrigin(candidate: string | undefined): boolean {
	if (!candidate?.trim()) {
		return false;
	}

	try {
		const parsed = new URL(candidate);
		if (parsed.username || parsed.password) {
			return false;
		}

		return isLoopbackHostname(parsed.hostname);
	} catch {
		return false;
	}
}

function isLocalDevelopmentAuthBypassConfiguration(): boolean {
	return (
		env.NODE_ENV?.trim().toLowerCase() === 'development' &&
		isLoopbackOrigin(env.ORIGIN) &&
		isLoopbackOrigin(env.WORKOS_REDIRECT_URI)
	);
}

function getDevelopmentAuthBypassUser() {
	if (env.DEV_AUTH_BYPASS?.trim().toLowerCase() !== 'true') {
		return null;
	}

	if (!isLocalDevelopmentAuthBypassConfiguration()) {
		throw new Error(
			'DEV_AUTH_BYPASS requires NODE_ENV=development with loopback-only ORIGIN and WORKOS_REDIRECT_URI.'
		);
	}

	return {
		firstName:
			env.DEV_AUTH_BYPASS_FIRST_NAME?.trim() || DEV_AUTH_BYPASS_FIRST_NAME,
		email: env.DEV_AUTH_BYPASS_EMAIL?.trim() || DEV_AUTH_BYPASS_EMAIL,
		profilePictureUrl: null
	};
}

if (env.DEV_AUTH_BYPASS?.trim().toLowerCase() === 'true') {
	getDevelopmentAuthBypassUser();
}

function getTrustedSignInOriginSet(): Set<string> {
	try {
		const workosEnv = getValidatedWorkosEnv(env);
		const cacheKey = [
			workosEnv.apiHostname,
			workosEnv.origin,
			workosEnv.redirectUri
		].join('|');
		if (
			trustedSignInOriginSetCache &&
			trustedSignInOriginCacheKey === cacheKey
		) {
			return trustedSignInOriginSetCache;
		}

		const trustedOrigins = getTrustedAuthOriginSet(workosEnv);
		trustedSignInOriginSetCache = trustedOrigins;
		trustedSignInOriginCacheKey = cacheKey;
		return trustedOrigins;
	} catch {
		// Build-time route analysis can evaluate this module before runtime env is injected.
		// Do not cache failures so later requests can recover once runtime env is available.
	}

	return new Set();
}
function sanitizeAvatarUrl(
	candidate: string | null | undefined
): string | null {
	if (!candidate) {
		return null;
	}

	try {
		const parsed = new URL(candidate);
		if (
			parsed.protocol !== 'https:' ||
			parsed.username ||
			parsed.password ||
			parsed.port
		) {
			return null;
		}

		return isTrustedAvatarHost(parsed.hostname) ? parsed.toString() : null;
	} catch {
		return null;
	}
}

function sanitizeSignInUrl(
	candidate: string | null | undefined,
	appOrigin: string,
	trustedOrigins: Set<string>
): string | null {
	if (!candidate) {
		return null;
	}

	try {
		const normalizedLocation = normalizeTrustedRedirectLocation(
			candidate,
			appOrigin,
			trustedOrigins
		);
		if (!normalizedLocation) {
			return null;
		}

		const parsed = new URL(normalizedLocation, appOrigin);
		return isTrustedSignInPath(parsed.pathname) ? normalizedLocation : null;
	} catch {
		return null;
	}
}

function isTrustedSignInPath(pathname: string): boolean {
	return TRUSTED_SIGN_IN_PATH_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
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
		const authErrorFromQuery = readVerifiedAuthError(event.url.searchParams, {
			secret: env.WORKOS_COOKIE_PASSWORD ?? ''
		});
		const developmentBypassUser = getDevelopmentAuthBypassUser();
		const user = developmentBypassUser ?? (await authKit.getUser(event));
		let signInUrl = null;
		if (!user) {
			const workosEnv = getValidatedWorkosEnv(env);
			const trustedSignInOrigins = getTrustedSignInOriginSet();
			signInUrl = sanitizeSignInUrl(
				await authKit.getSignInUrl({ returnTo: '/services' }),
				workosEnv.origin,
				trustedSignInOrigins
			);
		}
		const authError =
			user || signInUrl
				? null
				: (authErrorFromQuery ?? {
						message: AUTH_ERROR_MESSAGE,
						incidentId: null
					});
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
			errorCode: 'AUTH_LAYOUT_UNEXPECTED_FAILURE',
			...getErrorLogContext(err, {
				includeMessage: shouldIncludeErrorMessage(env)
			})
		});
		markAuthFailureNoStore(event);

		return {
			user: null,
			signInUrl: null,
			authError: {
				message: AUTH_ERROR_MESSAGE,
				incidentId
			}
		};
	}
};
