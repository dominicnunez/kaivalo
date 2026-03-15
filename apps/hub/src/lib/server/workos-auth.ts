import { redirect, type Handle, type RequestEvent } from '@sveltejs/kit';
import {
	AuthKitCore,
	CookieSessionStorage,
	SessionEncryptionError,
	TokenRefreshError,
	type AuthKitConfig,
	type BaseTokenClaims,
	type HeadersBag,
	type Session,
	configure,
	createAuthService,
	getConfigurationProvider,
	getWorkOS,
	sessionEncryption
} from '@workos/authkit-session';
import { randomUUID } from 'node:crypto';
import { AUTHKIT_COOKIE_NAME } from './authkit-config.ts';
import { getErrorLogContext } from './error-diagnostics.ts';
import { normalizeRequestId } from './request-id.ts';

type WorkosEnvLike = {
	clientId: string;
	apiKey: string;
	redirectUri: string;
	cookiePassword: string;
	apiHostname: string;
};

type WorkosSignOutEnvLike = WorkosEnvLike & {
	origin: string;
};

type CallbackResult = {
	response: Response | undefined;
	headers: HeadersBag | undefined;
	returnPathname: string;
	state: string | undefined;
	authResponse: unknown;
};

type SessionValidationResult = Awaited<
	ReturnType<AuthKitCore['validateAndRefresh']>
>;

type SessionLogContext = ReturnType<typeof getErrorLogContext> & {
	requestId: string;
	method: string;
	pathname: string;
	incidentId: string;
	errorCode: string;
};

const CALLBACK_AUTH_ERROR_PATHNAME = '/auth/error';
const CALLBACK_AUTH_ERROR_QUERY_NAME = 'code';
const CALLBACK_PROVIDER_ERROR_CODE_QUERY_NAME = 'provider_code';
const CALLBACK_ERROR_CODE_MAX_LENGTH = 64;
const CALLBACK_ERROR_CODE_SEPARATOR_PATTERN = /[^A-Za-z0-9._:-]+/g;
const CALLBACK_ERROR_CODE_EDGE_SEPARATOR_PATTERN = /^_+|_+$/g;

export type WorkosCallbackRequestHandlerDependencies = {
	handleCallback: (
		request: Request,
		response: Response,
		options: { code: string; state?: string }
	) => Promise<CallbackResult>;
};

export type WorkosSessionHandleDependencies = {
	getEncryptedSession: (request: Request) => Promise<string | null>;
	decryptSession: (encryptedSession: string) => Promise<Session>;
	validateAndRefresh: (session: Session) => Promise<SessionValidationResult>;
	encryptSession: (session: Session) => Promise<string>;
	saveSession: (
		response: Response | undefined,
		sessionData: string
	) => Promise<{ response?: Response; headers?: HeadersBag }>;
	clearSession: (
		response: Response | undefined
	) => Promise<{ response?: Response; headers?: HeadersBag }>;
};

type CreateWorkosSessionHandleOptions = {
	deps: WorkosSessionHandleDependencies;
	includeMessageInLogs?: boolean;
	logError?: (message: string, context: SessionLogContext) => void;
};

type SessionAuthState =
	| {
			kind: 'anonymous';
	  }
	| {
			kind: 'rejected';
			error: unknown;
	  }
	| {
			kind: 'unavailable';
			error: unknown;
	  }
	| {
			kind: 'authenticated';
			auth: App.Locals['auth'];
			refreshedSessionData?: string;
	  };

class RequestCookieSessionStorage extends CookieSessionStorage<
	Request,
	Response
> {
	constructor(config: AuthKitConfig) {
		super(config);
		// This app always uses a __Host- cookie name, which requires Secure.
		this.cookieOptions.secure = true;
	}

	async getSession(request: Request): Promise<string | null> {
		return readCookieValue(request.headers.get('cookie'), this.cookieName);
	}

	async clearSession(
		response: Response | undefined
	): Promise<{ response?: Response; headers?: HeadersBag }> {
		const header = this.buildSetCookie('', true);
		const mutated = await this.applyHeaders(response, {
			'Set-Cookie': header
		});
		return mutated ?? { headers: { 'Set-Cookie': header } };
	}
}

function readCookieValue(
	cookieHeader: string | null,
	cookieName: string
): string | null {
	if (!cookieHeader) {
		return null;
	}

	for (const pair of cookieHeader.split(';')) {
		const trimmed = pair.trim();
		if (!trimmed) {
			continue;
		}

		const separatorIndex = trimmed.indexOf('=');
		if (separatorIndex <= 0) {
			continue;
		}

		if (trimmed.slice(0, separatorIndex) !== cookieName) {
			continue;
		}

		const value = trimmed.slice(separatorIndex + 1);
		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}

	return null;
}

function buildAuthKitConfig(workosEnv: WorkosEnvLike): Partial<AuthKitConfig> {
	return {
		clientId: workosEnv.clientId,
		apiKey: workosEnv.apiKey,
		redirectUri: workosEnv.redirectUri,
		cookiePassword: workosEnv.cookiePassword,
		apiHostname: workosEnv.apiHostname,
		cookieName: AUTHKIT_COOKIE_NAME
	};
}

function configureAuthKitSession(workosEnv: WorkosEnvLike): AuthKitConfig {
	configure(buildAuthKitConfig(workosEnv));
	return getConfigurationProvider().getConfig();
}

function createEmptyAuth(): App.Locals['auth'] {
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

function createAuthenticatedAuth(
	session: Session,
	claims: BaseTokenClaims
): App.Locals['auth'] {
	return {
		user: session.user,
		organizationId: claims.org_id ?? null,
		role: claims.role ?? null,
		permissions: claims.permissions ?? [],
		sessionId: claims.sid,
		impersonator: session.impersonator ?? null,
		accessToken: session.accessToken
	};
}

function readErrorStatus(error: unknown): number | null {
	if (!error || typeof error !== 'object' || !('status' in error)) {
		return null;
	}

	const status = error.status;
	return typeof status === 'number' && Number.isFinite(status) ? status : null;
}

function isRecoverableSessionError(error: unknown): boolean {
	if (error instanceof SessionEncryptionError) {
		return true;
	}
	if (error instanceof TokenRefreshError) {
		const status = readErrorStatus(error.cause);
		return status !== null && status >= 400 && status < 500;
	}

	return false;
}

async function readSessionAuthState(
	deps: WorkosSessionHandleDependencies,
	request: Request
): Promise<SessionAuthState> {
	const encryptedSession = await deps.getEncryptedSession(request);
	if (!encryptedSession) {
		return {
			kind: 'anonymous'
		};
	}

	let session: Session;
	try {
		session = await deps.decryptSession(encryptedSession);
	} catch (error) {
		return {
			kind: 'rejected',
			error
		};
	}

	let validationResult: SessionValidationResult;
	try {
		validationResult = await deps.validateAndRefresh(session);
	} catch (error) {
		return {
			kind: isRecoverableSessionError(error) ? 'rejected' : 'unavailable',
			error
		};
	}

	let refreshedSessionData: string | undefined;
	if (validationResult.refreshed) {
		try {
			refreshedSessionData = await deps.encryptSession(
				validationResult.session
			);
		} catch (error) {
			return {
				kind: 'unavailable',
				error
			};
		}
	}

	return {
		kind: 'authenticated',
		auth: createAuthenticatedAuth(
			validationResult.session,
			validationResult.claims
		),
		refreshedSessionData
	};
}

function applyHeaderBag(
	headers: Headers,
	headerBag: HeadersBag | undefined
): void {
	if (!headerBag) {
		return;
	}

	for (const [key, value] of Object.entries(headerBag)) {
		const normalizedKey = key.toLowerCase();
		const values = Array.isArray(value) ? value : [value];
		if (normalizedKey === 'set-cookie') {
			for (const headerValue of values) {
				headers.append(key, headerValue);
			}
			continue;
		}

		headers.set(key, values.at(-1) ?? '');
	}
}

function createAuthUnavailableResponse(incidentId: string): Response {
	return new Response(`Authentication failed. Reference: ${incidentId}`, {
		status: 503,
		headers: {
			'content-type': 'text/plain; charset=utf-8'
		}
	});
}

function createSessionLogContext(
	event: Parameters<Handle>[0]['event'],
	error: unknown,
	incidentId: string,
	errorCode: string,
	includeMessage: boolean
): SessionLogContext {
	return {
		requestId: normalizeRequestId(event.request.headers.get('x-request-id')),
		method: event.request.method,
		pathname: event.url.pathname,
		incidentId,
		errorCode,
		...getErrorLogContext(error, {
			includeMessage
		})
	};
}

function sanitizeCallbackErrorCode(value: string | null): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value
		.trim()
		.replace(CALLBACK_ERROR_CODE_SEPARATOR_PATTERN, '_')
		.replace(CALLBACK_ERROR_CODE_EDGE_SEPARATOR_PATTERN, '')
		.slice(0, CALLBACK_ERROR_CODE_MAX_LENGTH);

	return normalized || null;
}

function createCallbackErrorRedirectLocation(
	errorCode: string,
	providerErrorCode: string | null
): string {
	const searchParams = new URLSearchParams();
	searchParams.set(CALLBACK_AUTH_ERROR_QUERY_NAME, errorCode);
	if (providerErrorCode) {
		searchParams.set(
			CALLBACK_PROVIDER_ERROR_CODE_QUERY_NAME,
			providerErrorCode
		);
	}

	return `${CALLBACK_AUTH_ERROR_PATHNAME}?${searchParams.toString()}`;
}

export function createWorkosCallbackRequestHandler({
	handleCallback
}: WorkosCallbackRequestHandlerDependencies): (
	event: RequestEvent
) => Promise<Response> {
	return async (event: RequestEvent) => {
		const code = event.url.searchParams.get('code');
		const state = event.url.searchParams.get('state') ?? undefined;
		const callbackError = event.url.searchParams.get('error');

		if (callbackError) {
			const errorCode =
				callbackError === 'access_denied' ? 'ACCESS_DENIED' : 'AUTH_ERROR';
			throw redirect(
				302,
				createCallbackErrorRedirectLocation(
					errorCode,
					sanitizeCallbackErrorCode(callbackError)
				)
			);
		}
		if (!code) {
			throw new Error('Missing authorization code');
		}

		const result = await handleCallback(event.request, new Response(), {
			code,
			state
		});
		const headers = new Headers();
		headers.set('location', result.returnPathname);
		if (result.response) {
			for (const [key, value] of result.response.headers.entries()) {
				headers.set(key, value);
			}
		}
		applyHeaderBag(headers, result.headers);

		return new Response(null, {
			status: 302,
			headers
		});
	};
}

export function createConfiguredWorkosCallbackRequestHandler(
	workosEnv: WorkosEnvLike
): (event: RequestEvent) => Promise<Response> {
	const config = configureAuthKitSession(workosEnv);
	const authService = createAuthService<Request, Response>({
		sessionStorageFactory: () => new RequestCookieSessionStorage(config)
	});

	return createWorkosCallbackRequestHandler({
		handleCallback: (request, response, options) =>
			authService.handleCallback(request, response, options)
	});
}

export function createConfiguredWorkosSignOutRequestHandler(
	workosEnv: WorkosSignOutEnvLike
): (event: RequestEvent) => Promise<Response> {
	const config = configureAuthKitSession(workosEnv);
	const authService = createAuthService<Request, Response>({
		sessionStorageFactory: () => new RequestCookieSessionStorage(config)
	});

	return async (event: RequestEvent) => {
		const sessionId = event.locals.auth?.sessionId;
		if (!sessionId) {
			throw redirect(302, '/');
		}

		const result = await authService.signOut(sessionId, {
			returnTo: workosEnv.origin
		});
		const headers = new Headers();
		headers.set('location', result.logoutUrl);
		if (result.response) {
			for (const [key, value] of result.response.headers.entries()) {
				headers.set(key, value);
			}
		}
		applyHeaderBag(headers, result.headers);

		return new Response(null, {
			status: 302,
			headers
		});
	};
}

export function createWorkosSessionHandle({
	deps,
	includeMessageInLogs = false,
	logError = console.error
}: CreateWorkosSessionHandleOptions): Handle {
	return async ({ event, resolve }) => {
		const authState = await readSessionAuthState(deps, event.request);

		switch (authState.kind) {
			case 'anonymous':
				event.locals.auth = createEmptyAuth();
				return resolve(event);

			case 'rejected': {
				event.locals.auth = createEmptyAuth();
				const incidentId = `authmw_${randomUUID()}`;
				logError(
					'Auth session rejected',
					createSessionLogContext(
						event,
						authState.error,
						incidentId,
						'AUTH_SESSION_REJECTED',
						includeMessageInLogs
					)
				);
				const response = await resolve(event);
				const clearResult = await deps.clearSession(undefined);
				applyHeaderBag(response.headers, clearResult.headers);
				return response;
			}

			case 'unavailable': {
				event.locals.auth = createEmptyAuth();
				const incidentId = `authmw_${randomUUID()}`;
				logError(
					'Auth session unavailable',
					createSessionLogContext(
						event,
						authState.error,
						incidentId,
						'AUTH_SESSION_UNEXPECTED_FAILURE',
						includeMessageInLogs
					)
				);
				return createAuthUnavailableResponse(incidentId);
			}

			case 'authenticated': {
				event.locals.auth = authState.auth;
				const response = await resolve(event);
				if (!authState.refreshedSessionData) {
					return response;
				}

				try {
					const saveResult = await deps.saveSession(
						undefined,
						authState.refreshedSessionData
					);
					applyHeaderBag(response.headers, saveResult.headers);
					return response;
				} catch (error) {
					const incidentId = `authmw_${randomUUID()}`;
					logError(
						'Auth session unavailable',
						createSessionLogContext(
							event,
							error,
							incidentId,
							'AUTH_SESSION_UNEXPECTED_FAILURE',
							includeMessageInLogs
						)
					);
					return createAuthUnavailableResponse(incidentId);
				}
			}
		}
	};
}

export function createConfiguredWorkosSessionHandle(
	workosEnv: WorkosEnvLike,
	options: Omit<CreateWorkosSessionHandleOptions, 'deps'> = {}
): Handle {
	const config = configureAuthKitSession(workosEnv);
	const storage = new RequestCookieSessionStorage(config);
	const core = new AuthKitCore(config, getWorkOS(), sessionEncryption);

	return createWorkosSessionHandle({
		...options,
		deps: {
			getEncryptedSession: (request) => storage.getSession(request),
			decryptSession: (encryptedSession) =>
				core.decryptSession(encryptedSession),
			validateAndRefresh: (session) => core.validateAndRefresh(session),
			encryptSession: (session) => core.encryptSession(session),
			saveSession: (response, sessionData) =>
				storage.saveSession(response, sessionData),
			clearSession: (response) => storage.clearSession(response)
		}
	});
}
