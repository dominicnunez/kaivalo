import { WORKOS_CALLBACK_STATE_COOKIE_NAME } from '../../src/lib/server/workos-auth.ts';

export function createWorkosCallbackStateCookie(state = 'test-state'): string {
	return `${WORKOS_CALLBACK_STATE_COOKIE_NAME}=${state}`;
}

export function buildWorkosCallbackState(
	returnPathname: string,
	state = 'test-state'
): string {
	return `${Buffer.from(JSON.stringify({ returnPathname }), 'utf8').toString('base64url')}.${state}`;
}

export function withWorkosCallbackStateCookie(
	headers: Record<string, string>,
	state = 'test-state'
): Record<string, string> {
	const cookie = createWorkosCallbackStateCookie(state);
	return {
		...headers,
		cookie: headers.cookie ? `${headers.cookie}; ${cookie}` : cookie
	};
}
