export const TEST_AUTH_SESSION_COOKIE_NAME = 'kaivalo_test_auth_session';

export const SENSITIVE_AUTH_COOKIE_NAMES = new Set([
	'wos-session',
	'__secure-wos-session',
	'__host-wos-session',
	TEST_AUTH_SESSION_COOKIE_NAME
]);
