import { authKit } from '@workos/authkit-sveltekit';
import { env } from '$env/dynamic/private';

const TEST_AUTH_USER_HEADER = 'x-kaivalo-test-auth-user';
const TEST_AUTH_FIXTURE_FLAG = 'KAIVALO_ENABLE_TEST_AUTH_FIXTURE';
const TEST_AUTH_RETURN_TO_HEADER = 'x-kaivalo-test-auth-return-to';
const TEST_AUTH_SIGN_OUT_RETURN_TO_HEADER =
	'x-kaivalo-test-auth-sign-out-return-to';
const TEST_AUTH_SESSION_COOKIE_NAME = 'kaivalo_test_auth_session';
const TEST_AUTH_SESSION_COOKIE_PATH = 'Path=/';
const TEST_AUTH_SESSION_COOKIE_SECURITY = 'HttpOnly; Secure; SameSite=Lax';
const TEST_AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60;

type AuthUser = Awaited<ReturnType<typeof authKit.getUser>>;

function normalizeOptionalString(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

function isTestAuthFixtureEnabled(): boolean {
	return env.NODE_ENV === 'test' && env[TEST_AUTH_FIXTURE_FLAG] === '1';
}

function parseFixtureUserPayload(
	headerValue: string | null
): AuthUser | null | undefined {
	if (!isTestAuthFixtureEnabled()) {
		return undefined;
	}
	if (headerValue === null) {
		return undefined;
	}

	let parsed;
	try {
		parsed = JSON.parse(Buffer.from(headerValue, 'base64url').toString('utf8'));
	} catch {
		return null;
	}

	if (!parsed || typeof parsed !== 'object') {
		return null;
	}

	return {
		firstName: normalizeOptionalString(parsed.firstName),
		email: normalizeOptionalString(parsed.email),
		profilePictureUrl: normalizeOptionalString(parsed.profilePictureUrl)
	} as AuthUser;
}

function serializeFixtureUser(user: AuthUser): string {
	return Buffer.from(JSON.stringify(user)).toString('base64url');
}

function buildFixtureSessionCookie(user: AuthUser): string {
	return [
		`${TEST_AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(serializeFixtureUser(user))}`,
		TEST_AUTH_SESSION_COOKIE_PATH,
		`Max-Age=${TEST_AUTH_SESSION_MAX_AGE_SECONDS}`,
		TEST_AUTH_SESSION_COOKIE_SECURITY
	].join('; ');
}

function buildFixtureSessionClearCookie(): string {
	return [
		`${TEST_AUTH_SESSION_COOKIE_NAME}=`,
		TEST_AUTH_SESSION_COOKIE_PATH,
		'Max-Age=0',
		TEST_AUTH_SESSION_COOKIE_SECURITY
	].join('; ');
}

function readCookie(
	cookieHeader: string | null,
	cookieName: string
): string | null {
	if (!cookieHeader) {
		return null;
	}

	for (const segment of cookieHeader.split(';')) {
		const [rawName, ...rest] = segment.trim().split('=');
		if (rawName !== cookieName) {
			continue;
		}

		return rest.join('=');
	}

	return null;
}

function readTestAuthUserFromSessionCookie(
	cookieHeader: string | null
): AuthUser | null | undefined {
	if (!isTestAuthFixtureEnabled()) {
		return undefined;
	}

	const encodedUser = readCookie(cookieHeader, TEST_AUTH_SESSION_COOKIE_NAME);
	if (encodedUser === null) {
		return undefined;
	}

	try {
		return parseFixtureUserPayload(decodeURIComponent(encodedUser));
	} catch {
		return null;
	}
}

export function getAuthRouteHandlers() {
	return {
		handleCallback: () => {
			return async (
				event: Parameters<ReturnType<typeof authKit.handleCallback>>[0]
			) => {
				const fixtureUser = parseFixtureUserPayload(
					event.request.headers.get(TEST_AUTH_USER_HEADER)
				);
				if (fixtureUser === undefined) {
					const workosHandleCallback = authKit.handleCallback();
					return workosHandleCallback(event);
				}
				if (fixtureUser === null) {
					throw new Error('Invalid test auth user fixture');
				}

				const returnTo =
					event.request.headers.get(TEST_AUTH_RETURN_TO_HEADER) ??
					`${event.url.origin}/`;

				return new Response(null, {
					status: 302,
					headers: {
						Location: returnTo,
						'Set-Cookie': buildFixtureSessionCookie(fixtureUser)
					}
				});
			};
		},
		signOut: async (event: Parameters<typeof authKit.signOut>[0]) => {
			const fixtureUser = readTestAuthUserFromSessionCookie(
				event.request.headers.get('cookie')
			);
			if (fixtureUser === undefined) {
				return authKit.signOut(event);
			}
			if (fixtureUser === null) {
				throw new Error('Invalid test auth session fixture');
			}

			return new Response(null, {
				status: 302,
				headers: {
					Location:
						event.request.headers.get(TEST_AUTH_SIGN_OUT_RETURN_TO_HEADER) ??
						`${event.url.origin}/`,
					'Set-Cookie': buildFixtureSessionClearCookie()
				}
			});
		}
	};
}

export async function getAuthUser(
	event: Parameters<typeof authKit.getUser>[0]
) {
	const testSessionUser = readTestAuthUserFromSessionCookie(
		event.request.headers.get('cookie')
	);
	if (testSessionUser !== undefined) {
		return testSessionUser;
	}

	const testUser = parseFixtureUserPayload(
		event.request.headers.get(TEST_AUTH_USER_HEADER)
	);
	if (testUser !== undefined) {
		return testUser;
	}

	return authKit.getUser(event);
}
