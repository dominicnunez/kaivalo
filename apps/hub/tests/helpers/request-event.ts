import type { RequestEvent } from '@sveltejs/kit';

type TestRequestEvent = RequestEvent<Record<string, string>, string | null>;

type CreateRequestEventOptions = {
	requestUrl?: string;
	method?: string;
	headers?: HeadersInit;
	locals?: Partial<App.Locals>;
	getClientAddress?: () => string;
	platform?: TestRequestEvent['platform'];
};

function createAuthState(): App.Locals['auth'] {
	return {
		user: null,
		organizationId: null,
		role: null,
		permissions: [],
		sessionId: undefined,
		impersonator: null,
		accessToken: undefined
	};
}

function createCookies(): TestRequestEvent['cookies'] {
	return {
		get: () => undefined,
		getAll: () => [],
		set: () => undefined,
		delete: () => undefined,
		serialize: (name, value) => `${name}=${value}`
	};
}

function createTracing(): TestRequestEvent['tracing'] {
	const span = {} as TestRequestEvent['tracing']['root'];

	return {
		enabled: false,
		root: span,
		current: span
	};
}

export function createRequestEvent({
	requestUrl = 'https://kaivalo.test/',
	method = 'GET',
	headers = {},
	locals,
	getClientAddress = () => '127.0.0.1',
	platform
}: CreateRequestEventOptions = {}): TestRequestEvent {
	const url = new URL(requestUrl);
	const auth = locals?.auth
		? { ...createAuthState(), ...locals.auth }
		: createAuthState();

	return {
		cookies: createCookies(),
		fetch: globalThis.fetch.bind(globalThis),
		getClientAddress,
		isDataRequest: false,
		isRemoteRequest: false,
		isSubRequest: false,
		locals: {
			auth,
			...locals
		},
		params: {},
		platform,
		request: new Request(url, {
			method,
			headers
		}),
		route: {
			id: null
		},
		setHeaders: () => undefined,
		tracing: createTracing(),
		url
	};
}
