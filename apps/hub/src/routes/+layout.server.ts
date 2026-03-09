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
import { isTrustedAvatarHost } from '$lib/server/trusted-hosts.ts';
import { isLoopbackIpAddress } from '$lib/server/ip-address.ts';
import { authKit } from '@workos/authkit-sveltekit';

const LOCAL_SIGN_IN_PATH = '/auth/sign-in';
const DEV_AUTH_BYPASS_CONFIGURATION_ERROR_MESSAGE =
	'DEV_AUTH_BYPASS requires NODE_ENV=development with loopback-only ORIGIN and WORKOS_REDIRECT_URI callback URL.';
const DEV_AUTH_BYPASS_EMAIL = 'dev@kaivalo.local';
const DEV_AUTH_BYPASS_FIRST_NAME = 'Dev';

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

function readUrl(candidate: string | undefined): URL | null {
	if (!candidate?.trim()) {
		return null;
	}

	try {
		return new URL(candidate);
	} catch {
		return null;
	}
}

function isLoopbackOriginUrl(candidate: string | undefined): boolean {
	const parsed = readUrl(candidate);
	if (!parsed || parsed.username || parsed.password) {
		return false;
	}

	if (
		(parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
		parsed.pathname !== '/' ||
		parsed.search ||
		parsed.hash
	) {
		return false;
	}

	return isLoopbackHostname(parsed.hostname);
}

function isLoopbackCallbackUrl(candidate: string | undefined): boolean {
	const parsed = readUrl(candidate);
	if (!parsed || parsed.username || parsed.password) {
		return false;
	}

	if (
		(parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
		parsed.pathname !== '/auth/callback' ||
		parsed.search ||
		parsed.hash
	) {
		return false;
	}

	return isLoopbackHostname(parsed.hostname);
}

function hasValidLocalDevelopmentAuthBypassConfiguration(): boolean {
	return (
		env.NODE_ENV?.trim().toLowerCase() === 'development' &&
		isLoopbackOriginUrl(env.ORIGIN) &&
		isLoopbackCallbackUrl(env.WORKOS_REDIRECT_URI)
	);
}

function getDevelopmentAuthBypassUser() {
	if (env.DEV_AUTH_BYPASS?.trim().toLowerCase() !== 'true') {
		return null;
	}

	if (!hasValidLocalDevelopmentAuthBypassConfiguration()) {
		throw new Error(DEV_AUTH_BYPASS_CONFIGURATION_ERROR_MESSAGE);
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
			getValidatedWorkosEnv(env);
			signInUrl = LOCAL_SIGN_IN_PATH;
		}
		const authError = user
			? null
			: (authErrorFromQuery ??
				(signInUrl
					? null
					: {
							message: AUTH_ERROR_MESSAGE,
							incidentId: null
						}));
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
