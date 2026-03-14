import { env } from '$env/dynamic/private';
import { randomUUID } from 'node:crypto';
import type { LayoutServerLoad } from './$types';
import { getValidatedWorkosEnv } from '$lib/server/workos-security.ts';
import {
	getErrorLogContext,
	shouldIncludeErrorMessage
} from '$lib/server/error-diagnostics.ts';
import { normalizeRequestId } from '$lib/server/request-id.ts';
import {
	AUTH_ERROR_MESSAGE,
	readVerifiedAuthError
} from '$lib/auth/auth-error-query.ts';
import { toAvatarProxyUrl } from '$lib/server/avatar-url.ts';
import {
	isLoopbackHostname as isLoopbackHost,
	isLoopbackIpAddress
} from '$lib/server/ip-address.ts';
import {
	getProxyTrustConfiguration,
	markPrivateNoStoreDocument,
	isDevAuthBypassEnabled
} from '$lib/server/workos-security.ts';
import { getRequestPeerAddress } from '$lib/server/request-peer-address.ts';
import { getTrustedClientAddress } from '$lib/server/trusted-client-address.ts';
import { authKit } from '@workos/authkit-sveltekit';

const LOCAL_SIGN_IN_PATH = '/auth/sign-in';
const DEV_AUTH_BYPASS_REQUEST_ERROR_MESSAGE =
	'DEV_AUTH_BYPASS only serves requests from loopback hosts and loopback clients.';
const DEV_AUTH_BYPASS_EMAIL = 'dev@kaivalo.local';
const DEV_AUTH_BYPASS_FIRST_NAME = 'Dev';
const FORWARDED_FOR_HEADER = 'x-forwarded-for';

type LayoutUser = {
	firstName: string | null;
	email: string;
	profilePictureUrl: string | null;
};

function readOptionalAuthStringField(
	record: Record<string, unknown>,
	fieldName: 'firstName' | 'profilePictureUrl'
): string | null {
	const value = record[fieldName];
	if (value === undefined || value === null) {
		return null;
	}

	if (typeof value !== 'string') {
		throw new Error(`AuthKit returned a non-string ${fieldName}`);
	}

	const normalized = value.trim();
	return normalized === '' ? null : normalized;
}

function readRequiredAuthEmail(record: Record<string, unknown>): string {
	const value = record.email;
	if (typeof value !== 'string') {
		throw new Error('AuthKit returned a non-string email');
	}

	const normalized = value.trim();
	if (normalized === '') {
		throw new Error('AuthKit returned an empty email');
	}

	return normalized;
}

function parseLayoutUser(candidate: unknown): LayoutUser | null {
	if (candidate === null) {
		return null;
	}

	if (typeof candidate !== 'object') {
		throw new Error('AuthKit returned an invalid user payload');
	}

	const record = candidate as Record<string, unknown>;
	return {
		firstName: readOptionalAuthStringField(record, 'firstName'),
		email: readRequiredAuthEmail(record),
		profilePictureUrl: readOptionalAuthStringField(record, 'profilePictureUrl')
	};
}

function isLoopbackHostname(hostname: string): boolean {
	return isLoopbackHost(hostname);
}

function getDevelopmentAuthBypassClientAddress(
	event: Parameters<LayoutServerLoad>[0]
): string {
	const directPeerAddress = getRequestPeerAddress(event);
	if (!directPeerAddress) {
		return '';
	}

	const workosEnv = getValidatedWorkosEnv(env);
	const { trustedProxyIps } = getProxyTrustConfiguration(env, workosEnv.origin);
	const trustedProxyIpSet = new Set(trustedProxyIps);
	const directPeerIsTrustedProxy = trustedProxyIpSet.has(directPeerAddress);
	const configuredAddressHeader =
		env.ADDRESS_HEADER?.trim().toLowerCase() ?? '';
	if (
		configuredAddressHeader &&
		configuredAddressHeader !== FORWARDED_FOR_HEADER &&
		event.request.headers.has(configuredAddressHeader)
	) {
		return '';
	}

	const forwardedForHeader = event.request.headers.get(FORWARDED_FOR_HEADER);
	if (forwardedForHeader !== null) {
		if (!directPeerIsTrustedProxy) {
			return '';
		}

		return getTrustedClientAddress({
			directClientAddress: directPeerAddress,
			forwardedForHeader,
			trustedProxyIps
		});
	}

	return directPeerIsTrustedProxy ? '' : directPeerAddress;
}

function hasValidLocalDevelopmentAuthBypassRequest(
	event: Parameters<LayoutServerLoad>[0]
): boolean {
	if (!isLoopbackHostname(event.url.hostname)) {
		return false;
	}

	try {
		return isLoopbackIpAddress(getDevelopmentAuthBypassClientAddress(event));
	} catch {
		return false;
	}
}

function getDevelopmentAuthBypassUser(
	event: Parameters<LayoutServerLoad>[0]
): LayoutUser | null {
	if (!isDevAuthBypassEnabled(env)) {
		return null;
	}
	if (!hasValidLocalDevelopmentAuthBypassRequest(event)) {
		throw new Error(DEV_AUTH_BYPASS_REQUEST_ERROR_MESSAGE);
	}

	return {
		firstName:
			env.DEV_AUTH_BYPASS_FIRST_NAME?.trim() || DEV_AUTH_BYPASS_FIRST_NAME,
		email: env.DEV_AUTH_BYPASS_EMAIL?.trim() || DEV_AUTH_BYPASS_EMAIL,
		profilePictureUrl: null
	};
}

function markAuthFailureNoStore(event: Parameters<LayoutServerLoad>[0]): void {
	markPrivateNoStoreDocument(event, ['Cookie', 'Authorization']);
}

function logAuthLayoutFailure(
	event: Parameters<LayoutServerLoad>[0],
	err: unknown,
	incidentId: string
): void {
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
}

function createAuthFailureResponse(
	event: Parameters<LayoutServerLoad>[0],
	incidentId: string,
	signInUrl: string | null
) {
	markAuthFailureNoStore(event);

	return {
		user: null,
		signInUrl,
		authError: {
			message: AUTH_ERROR_MESSAGE,
			incidentId
		}
	};
}

export const load: LayoutServerLoad = async (event) => {
	try {
		const authErrorFromQuery = readVerifiedAuthError(event.url.searchParams, {
			secret: env.AUTH_ERROR_SIGNING_SECRET ?? ''
		});
		const developmentBypassUser = getDevelopmentAuthBypassUser(event);
		let user: LayoutUser | null = developmentBypassUser;
		if (!user) {
			try {
				user = parseLayoutUser(await authKit.getUser(event));
			} catch (err) {
				const incidentId = `authlayout_${randomUUID()}`;
				let signInUrl: string | null = null;
				try {
					getValidatedWorkosEnv(env);
					signInUrl = LOCAL_SIGN_IN_PATH;
				} catch {
					signInUrl = null;
				}

				logAuthLayoutFailure(event, err, incidentId);
				return createAuthFailureResponse(event, incidentId, signInUrl);
			}
		}

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
						profilePictureUrl: toAvatarProxyUrl(user.profilePictureUrl)
					}
				: null,
			signInUrl: user ? null : signInUrl,
			authError
		};
	} catch (err) {
		const incidentId = `authlayout_${randomUUID()}`;
		logAuthLayoutFailure(event, err, incidentId);
		return createAuthFailureResponse(event, incidentId, null);
	}
};
