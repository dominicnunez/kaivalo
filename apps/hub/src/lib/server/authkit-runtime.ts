import { authKit } from '@workos/authkit-sveltekit';
import { env } from '$env/dynamic/private';

const TEST_AUTH_USER_HEADER = 'x-kaivalo-test-auth-user';
const TEST_AUTH_FIXTURE_FLAG = 'KAIVALO_ENABLE_TEST_AUTH_FIXTURE';

type AuthUser = Awaited<ReturnType<typeof authKit.getUser>>;

function normalizeOptionalString(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.trim();
	return normalized.length > 0 ? normalized : null;
}

function readTestAuthUser(headerValue: string | null): AuthUser | undefined {
	if (env.NODE_ENV !== 'test' || env[TEST_AUTH_FIXTURE_FLAG] !== '1') {
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

export function getAuthRouteHandlers() {
	return {
		handleCallback: authKit.handleCallback,
		signOut: authKit.signOut
	};
}

export async function getAuthUser(
	event: Parameters<typeof authKit.getUser>[0]
) {
	const testUser = readTestAuthUser(
		event.request.headers.get(TEST_AUTH_USER_HEADER)
	);
	if (testUser !== undefined) {
		return testUser;
	}

	return authKit.getUser(event);
}
