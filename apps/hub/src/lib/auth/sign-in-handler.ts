import { error, isRedirect, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getErrorLogContext } from '../server/error-diagnostics.ts';
import { normalizeRequestId } from '../server/request-id.ts';
import { buildAuthErrorRedirectQuery } from './auth-error-query.ts';
import {
	isBrowserNavigationRequest,
	normalizeConfiguredOrigin
} from './request-policy.ts';
import { normalizeTrustedRedirectLocation } from './safe-redirect.ts';

type SignInLogContext = ReturnType<typeof getErrorLogContext> & {
	requestId: string;
	method: string;
	pathname: string;
	incidentId: string;
	errorCode: string;
};

type CreateSignInGetHandlerOptions = {
	getSignInUrl: (options: { returnTo: string }) => Promise<string>;
	expectedOrigin: string;
	authErrorSigningSecret: string;
	allowedRedirectOrigins?: Iterable<string>;
	defaultReturnTo?: string;
	includeMessageInLogs?: boolean;
	logError?: (message: string, context: SignInLogContext) => void;
};

function isSelfReferentialRedirect(
	location: string,
	expectedOrigin: string,
	requestPathname: string
): boolean {
	const normalizedLocation = new URL(location, expectedOrigin);
	return (
		normalizedLocation.origin === expectedOrigin &&
		normalizedLocation.pathname === requestPathname
	);
}

export function createSignInGetHandler({
	getSignInUrl,
	expectedOrigin,
	authErrorSigningSecret,
	allowedRedirectOrigins = [],
	defaultReturnTo = '/services',
	includeMessageInLogs = false,
	logError = console.error
}: CreateSignInGetHandlerOptions): (event: RequestEvent) => Promise<Response> {
	const trustedOrigin = normalizeConfiguredOrigin(expectedOrigin);
	const trustedRedirectOrigins = Array.from(allowedRedirectOrigins, (origin) =>
		normalizeConfiguredOrigin(origin)
	);

	return async (event: RequestEvent) => {
		try {
			const signInUrl = await getSignInUrl({ returnTo: defaultReturnTo });
			const safeLocation = normalizeSignInRedirectLocation(signInUrl, {
				requestOrigin: event.url.origin,
				trustedOrigin,
				allowedOrigins: trustedRedirectOrigins,
				requestPathname: event.url.pathname
			});
			throw redirect(303, safeLocation);
		} catch (err) {
			let normalizedError = err;
			if (isRedirect(err)) {
				const redirectError = err;
				let safeLocation: string | null = null;
				try {
					safeLocation = normalizeSignInRedirectLocation(
						redirectError.location,
						{
							requestOrigin: event.url.origin,
							trustedOrigin,
							allowedOrigins: trustedRedirectOrigins,
							requestPathname: event.url.pathname
						}
					);
				} catch (normalizationError) {
					normalizedError = normalizationError;
				}
				if (safeLocation) {
					if (safeLocation === redirectError.location) {
						throw redirectError;
					}
					throw redirect(redirectError.status, safeLocation);
				}
			}

			const requestId = normalizeRequestId(
				event.request.headers.get('x-request-id')
			);
			const incidentId = `authsign_${randomUUID()}`;
			const signInLogContext = {
				requestId,
				method: event.request.method,
				pathname: event.url.pathname,
				incidentId,
				errorCode: 'AUTH_SIGN_IN_UNEXPECTED_FAILURE',
				...getErrorLogContext(normalizedError, {
					includeMessage: includeMessageInLogs
				})
			};

			logError('Sign-in failed', signInLogContext);

			if (!isBrowserNavigationRequest(event.request)) {
				throw error(503, `Sign-in failed. Reference: ${incidentId}`);
			}

			throw redirect(
				303,
				`/?${buildAuthErrorRedirectQuery({
					incidentId,
					secret: authErrorSigningSecret
				})}`
			);
		}
	};
}

function normalizeSignInRedirectLocation(
	location: string,
	options: {
		requestOrigin: string;
		trustedOrigin: string;
		allowedOrigins: Iterable<string>;
		requestPathname: string;
	}
): string {
	const safeLocation = normalizeTrustedRedirectLocation(location, {
		requestOrigin: options.requestOrigin,
		trustedOrigin: options.trustedOrigin,
		allowedOrigins: options.allowedOrigins
	});
	if (!safeLocation) {
		throw new Error('Sign-in produced an invalid redirect location');
	}
	if (
		isSelfReferentialRedirect(
			safeLocation,
			options.trustedOrigin,
			options.requestPathname
		)
	) {
		throw new Error('Sign-in produced a self-referential redirect location');
	}

	return safeLocation;
}
