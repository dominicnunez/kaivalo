import { isRedirect, isHttpError, type HttpError } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { createAuthCallbackGetHandler } from '$lib/auth/callback-handler.ts';
import { shouldIncludeErrorMessage } from '$lib/server/error-diagnostics.ts';
import { getValidatedWorkosEnv } from '$lib/server/workos-security.ts';
import {
	createClearedWorkosCallbackStateCookieHeader,
	createConfiguredWorkosCallbackRequestHandler,
	didValidateWorkosCallbackState
} from '$lib/server/workos-auth.ts';

let getHandler: ReturnType<typeof createAuthCallbackGetHandler> | null = null;

function appendClearedCallbackStateCookie(response: Response): Response {
	response.headers.append(
		'set-cookie',
		createClearedWorkosCallbackStateCookieHeader()
	);
	return response;
}

function createHttpErrorResponse(error: HttpError): Response {
	return new Response(JSON.stringify(error.body), {
		status: error.status,
		headers: {
			'content-type': 'application/json; charset=utf-8'
		}
	});
}

function getCallbackHandler(): ReturnType<typeof createAuthCallbackGetHandler> {
	if (getHandler) {
		return getHandler;
	}

	const workosEnv = getValidatedWorkosEnv(env);
	getHandler = createAuthCallbackGetHandler({
		handleCallback: () =>
			createConfiguredWorkosCallbackRequestHandler(workosEnv),
		isRedirect,
		isHttpError,
		authErrorSigningSecret: workosEnv.authErrorSigningSecret,
		expectedOrigin: workosEnv.origin,
		includeMessageInLogs: shouldIncludeErrorMessage(env)
	});
	return getHandler;
}

export const GET: RequestHandler = async (event) => {
	try {
		const response = await getCallbackHandler()(event);
		return didValidateWorkosCallbackState(event)
			? appendClearedCallbackStateCookie(response)
			: response;
	} catch (error) {
		if (!isRedirect(error)) {
			if (didValidateWorkosCallbackState(event) && isHttpError(error)) {
				return appendClearedCallbackStateCookie(createHttpErrorResponse(error));
			}
			throw error;
		}

		const response = new Response(null, {
			status: error.status,
			headers: {
				location: error.location
			}
		});
		return didValidateWorkosCallbackState(event)
			? appendClearedCallbackStateCookie(response)
			: response;
	}
};
