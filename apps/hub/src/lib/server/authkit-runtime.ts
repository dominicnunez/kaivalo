import { authKit } from '@workos/authkit-sveltekit';
import { env as privateEnv } from '$env/dynamic/private';

const SESSION_COOKIE_NAME = 'wos-session';
const SESSION_COOKIE_DELETE_HEADER = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
const SESSION_COOKIE_FIXTURE_HEADER = `${SESSION_COOKIE_NAME}=fixture-session; Path=/; HttpOnly; Secure; SameSite=Lax`;

type PrivateEnv = Record<string, string | undefined>;
type CallbackMode = 'workos' | 'fixture-error' | 'fixture-success';
type SignOutMode = 'workos' | 'fixture-success';

function appendSetCookieHeaders(
	response: Response,
	headers: readonly string[]
): Response {
	for (const value of headers) {
		response.headers.append('set-cookie', value);
	}

	return response;
}

function createRedirectResponse(
	location: string,
	setCookieHeaders: readonly string[] = []
): Response {
	return appendSetCookieHeaders(
		new Response(null, {
			status: 302,
			headers: {
				location
			}
		}),
		setCookieHeaders
	);
}

function readCallbackMode(env: PrivateEnv): CallbackMode {
	if (env.NODE_ENV !== 'test') {
		return 'workos';
	}

	switch (env.KAIVALO_TEST_CALLBACK_MODE) {
		case undefined:
		case '':
		case 'workos':
			return 'workos';
		case 'error':
			return 'fixture-error';
		case 'success':
			return 'fixture-success';
		default:
			throw new Error(
				'KAIVALO_TEST_CALLBACK_MODE must be workos, error, or success'
			);
	}
}

function readSignOutMode(env: PrivateEnv): SignOutMode {
	if (env.NODE_ENV !== 'test') {
		return 'workos';
	}

	switch (env.KAIVALO_TEST_SIGN_OUT_MODE) {
		case undefined:
		case '':
		case 'workos':
			return 'workos';
		case 'success':
			return 'fixture-success';
		default:
			throw new Error('KAIVALO_TEST_SIGN_OUT_MODE must be workos or success');
	}
}

function createTestCallbackHandler(env: PrivateEnv) {
	const callbackMode = readCallbackMode(env);
	if (callbackMode === 'workos') {
		return authKit.handleCallback();
	}

	if (callbackMode === 'fixture-error') {
		return async () => {
			throw new Error('Forced auth callback failure for integration test');
		};
	}

	const returnTo = env.KAIVALO_TEST_CALLBACK_RETURN_TO || '/';
	return async () =>
		createRedirectResponse(returnTo, [SESSION_COOKIE_FIXTURE_HEADER]);
}

function createTestSignOutHandler(env: PrivateEnv) {
	const signOutMode = readSignOutMode(env);
	if (signOutMode === 'workos') {
		return authKit.signOut;
	}

	return async () =>
		createRedirectResponse('/', [SESSION_COOKIE_DELETE_HEADER]);
}

export function getAuthRouteHandlers(env: PrivateEnv = privateEnv) {
	return {
		handleCallback: () => createTestCallbackHandler(env),
		signOut: createTestSignOutHandler(env)
	};
}
