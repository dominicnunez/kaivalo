import { authKit } from '@workos/authkit-sveltekit';
import { env } from '$env/dynamic/private';
import { randomUUID } from 'node:crypto';
import type { LayoutServerLoad } from './$types';
import { getValidatedWorkosEnv } from '$lib/server/workos-security.js';
import {
	getErrorLogContext,
	shouldIncludeErrorMessage
} from '$lib/server/error-diagnostics.js';
import { normalizeRequestId } from '$lib/auth/log-context.js';
import {
	AUTH_ERROR_MESSAGE,
	readVerifiedAuthError
} from '$lib/auth/auth-error-query.js';
import { isTrustedAvatarHost } from '$lib/server/trusted-hosts.js';
import { getAuthUser } from '$lib/server/authkit-runtime.js';

const TRUSTED_SIGN_IN_PATH_PREFIXES = [
	'/auth/sign-in',
	'/user_management/authorize'
];
let trustedSignInOriginSetCache: Set<string> | null = null;
let trustedSignInOriginCacheKey: string | null = null;

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

		const trustedOrigins = new Set<string>();
		trustedOrigins.add(`https://${workosEnv.apiHostname}`);
		trustedOrigins.add(workosEnv.origin);
		trustedOrigins.add(new URL(workosEnv.redirectUri).origin);
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
		const user = await getAuthUser(event);
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
			authErrorFromQuery ??
			(user || signInUrl
				? null
				: {
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
