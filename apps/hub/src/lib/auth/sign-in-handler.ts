import { error, isRedirect, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getErrorLogContext } from '../server/error-diagnostics.ts';
import { normalizeRequestId } from '../server/request-id.ts';
import { buildAuthErrorRedirectQuery } from './auth-error-query.ts';
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

function normalizeExpectedOrigin(value: string): string {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error('expectedOrigin must be a valid URL origin');
	}

	if (
		parsed.username ||
		parsed.password ||
		parsed.pathname !== '/' ||
		parsed.search ||
		parsed.hash
	) {
		throw new Error('expectedOrigin must be a valid URL origin');
	}

	return parsed.origin;
}

function shouldUseUserRedirect(event: RequestEvent): boolean {
	const mode = event.request.headers.get('sec-fetch-mode');
	const destination = event.request.headers.get('sec-fetch-dest');
	if (mode === 'navigate' || destination === 'document') {
		return true;
	}

	const accept = event.request.headers.get('accept')?.toLowerCase() ?? '';
	return accept.includes('text/html') && !accept.includes('application/json');
}

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
	const trustedOrigin = normalizeExpectedOrigin(expectedOrigin);
	const trustedRedirectOrigins = Array.from(allowedRedirectOrigins, (origin) =>
		normalizeExpectedOrigin(origin)
	);

	return async (event: RequestEvent) => {
		try {
			const signInUrl = await getSignInUrl({ returnTo: defaultReturnTo });
			const safeLocation = normalizeTrustedRedirectLocation(
				signInUrl,
				trustedOrigin,
				trustedRedirectOrigins
			);
			if (!safeLocation) {
				throw new Error('Sign-in produced an invalid redirect location');
			}
			if (
				isSelfReferentialRedirect(
					safeLocation,
					trustedOrigin,
					event.url.pathname
				)
			) {
				throw new Error(
					'Sign-in produced a self-referential redirect location'
				);
			}

			throw redirect(303, safeLocation);
		} catch (err) {
			if (isRedirect(err)) {
				throw err;
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
				...getErrorLogContext(err, {
					includeMessage: includeMessageInLogs
				})
			};

			logError('Sign-in failed', signInLogContext);

			if (!shouldUseUserRedirect(event)) {
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
