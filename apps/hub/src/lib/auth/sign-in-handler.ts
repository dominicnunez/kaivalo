import { error, isRedirect, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getErrorLogContext } from '../server/error-diagnostics.ts';
import { normalizeRequestId } from '../server/request-id.ts';
import { buildAuthErrorLandingRedirectLocation } from './auth-error-query.ts';
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
	beginSignIn: (options: {
		returnTo: string;
	}) => Promise<{ location: string; headers?: HeadersInit }>;
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

function createRedirectResponse(
	status: number,
	location: string,
	headers?: HeadersInit
): Response {
	const responseHeaders = new Headers(headers);
	responseHeaders.set('location', location);
	return new Response(null, {
		status,
		headers: responseHeaders
	});
}

export function createSignInGetHandler({
	beginSignIn,
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
			const signIn = await beginSignIn({ returnTo: defaultReturnTo });
			const safeLocation = normalizeSignInRedirectLocation(signIn.location, {
				requestOrigin: event.url.origin,
				trustedOrigin,
				allowedOrigins: trustedRedirectOrigins,
				requestPathname: event.url.pathname
			});
			return createRedirectResponse(303, safeLocation, signIn.headers);
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
					return createRedirectResponse(redirectError.status, safeLocation);
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
				buildAuthErrorLandingRedirectLocation({
					incidentId,
					secret: authErrorSigningSecret,
					origin: trustedOrigin
				})
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
