import assert from 'node:assert/strict';
import type { CookieJar } from 'tough-cookie';
import {
	createBrowserCookieJar,
	httpGet,
	type PreviewHttpResponse
} from '../../../../tests/helpers/hub-preview.ts';

type StartedWorkosAuthFlow = {
	cookieJar: CookieJar;
	signInResponse: PreviewHttpResponse;
	signInLocation: URL;
	state: string;
};

type BeginWorkosAuthFlowOptions = {
	cookieJar?: CookieJar;
};

type CompleteWorkosCallbackOptions = {
	cookieJar: CookieJar;
	state: string;
	accept?: string;
	headers?: Record<string, string>;
};

function createBrowserNavigationHeaders(
	headers: Record<string, string> = {},
	accept = 'text/html'
): Record<string, string> {
	return {
		accept,
		'sec-fetch-mode': 'navigate',
		...headers
	};
}

function readRedirectLocation(
	response: PreviewHttpResponse,
	baseUrl: string
): URL {
	assert.ok(response.headers.location, 'Expected a redirect location');
	return new URL(String(response.headers.location), baseUrl);
}

export async function beginWorkosAuthFlow(
	baseUrl: string,
	{ cookieJar = createBrowserCookieJar() }: BeginWorkosAuthFlowOptions = {}
): Promise<StartedWorkosAuthFlow> {
	const signInResponse = await httpGet(`${baseUrl}/auth/sign-in`, {
		headers: createBrowserNavigationHeaders(),
		cookieJar,
		sameSiteContext: 'strict'
	});
	const signInLocation = readRedirectLocation(signInResponse, baseUrl);
	const state = signInLocation.searchParams.get('state');

	assert.strictEqual(signInResponse.statusCode, 303);
	assert.ok(state, 'Expected /auth/sign-in to include an auth state');

	return {
		cookieJar,
		signInResponse,
		signInLocation,
		state
	};
}

export async function primeWorkosCallbackStateCookie(
	baseUrl: string,
	{
		cookieJar = createBrowserCookieJar(),
		state = 'test-state'
	}: BeginWorkosAuthFlowOptions & { state?: string } = {}
): Promise<CookieJar> {
	await cookieJar.setCookie(
		`__Host-wos_callback_state=${encodeURIComponent(state)}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`,
		new URL('/auth/sign-in', baseUrl).toString()
	);

	return cookieJar;
}

export async function completeWorkosCodeExchange(
	baseUrl: string,
	{
		cookieJar,
		state,
		accept = 'text/html',
		headers = {}
	}: CompleteWorkosCallbackOptions
): Promise<PreviewHttpResponse> {
	return httpGet(
		`${baseUrl}/auth/callback?code=test-code&state=${encodeURIComponent(state)}`,
		{
			headers:
				accept === 'text/html'
					? createBrowserNavigationHeaders(headers, accept)
					: { accept, ...headers },
			cookieJar,
			sameSiteContext: 'lax'
		}
	);
}

export async function completeWorkosErrorCallback(
	baseUrl: string,
	{
		cookieJar,
		state,
		accept = 'text/html',
		headers = {},
		errorCode
	}: CompleteWorkosCallbackOptions & { errorCode: string }
): Promise<PreviewHttpResponse> {
	return httpGet(
		`${baseUrl}/auth/callback?error=${encodeURIComponent(errorCode)}&state=${encodeURIComponent(state)}`,
		{
			headers:
				accept === 'text/html'
					? createBrowserNavigationHeaders(headers, accept)
					: { accept, ...headers },
			cookieJar,
			sameSiteContext: 'lax'
		}
	);
}

export async function signInThroughWorkosCallback(
	baseUrl: string,
	{ cookieJar = createBrowserCookieJar() }: BeginWorkosAuthFlowOptions = {}
): Promise<StartedWorkosAuthFlow & { callbackResponse: PreviewHttpResponse }> {
	const flow = await beginWorkosAuthFlow(baseUrl, { cookieJar });
	const callbackResponse = await completeWorkosCodeExchange(baseUrl, {
		cookieJar: flow.cookieJar,
		state: flow.state
	});

	return {
		...flow,
		callbackResponse
	};
}
