import { configureAuthKit, authKitHandle } from '@workos/authkit-sveltekit';
import { sequence } from '@sveltejs/kit/hooks';
import type { HandleServerError } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { randomUUID } from 'node:crypto';
import {
	createSecurityHeadersHandle,
	getProxyTrustConfiguration,
	getValidatedWorkosEnv
} from '$lib/server/workos-security.js';
import { getErrorLogContext } from '$lib/server/error-diagnostics.js';
import { normalizeRequestId } from '$lib/auth/log-context.js';

const workosEnv = getValidatedWorkosEnv(env);
const { trustForwardedProto, trustedProxyIps } = getProxyTrustConfiguration(
	env,
	workosEnv.origin
);
configureAuthKit({
	clientId: workosEnv.clientId,
	apiKey: workosEnv.apiKey,
	redirectUri: workosEnv.redirectUri,
	cookiePassword: workosEnv.cookiePassword,
	apiHostname: workosEnv.apiHostname
});
const configuredHandle = sequence(
	createSecurityHeadersHandle({ trustForwardedProto, trustedProxyIps }),
	authKitHandle()
);

export const handle = ({ event, resolve }) =>
	configuredHandle({ event, resolve });

export const handleError: HandleServerError = ({ error, event, status }) => {
	const incidentId = `hook_${randomUUID()}`;
	const requestId = normalizeRequestId(
		event.request.headers.get('x-request-id')
	);
	const includeMessage = env.NODE_ENV?.trim().toLowerCase() !== 'production';
	console.error('Unhandled request error', {
		incidentId,
		requestId,
		pathname: event.url.pathname,
		method: event.request.method,
		status,
		errorCode: 'HOOK_UNEXPECTED_FAILURE',
		...getErrorLogContext(error, { includeMessage })
	});

	return {
		message: 'An unexpected error occurred. Please try again.',
		incidentId
	};
};
