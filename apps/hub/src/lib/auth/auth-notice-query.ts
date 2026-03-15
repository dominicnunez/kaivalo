import { normalizeConfiguredOrigin } from './request-policy.ts';

export const AUTH_NOTICE_QUERY_NAME = 'notice';
export const AUTH_NOTICE_SIGN_IN_CANCELLED_VALUE = 'sign_in_cancelled';
export const AUTH_NOTICE_SIGN_IN_CANCELLED_MESSAGE =
	'Sign-in was cancelled. Try again when you are ready.';

export type AuthNotice = {
	message: string;
	incidentId: null;
};

type BuildAuthNoticeLandingRedirectLocationOptions = {
	origin: string;
	notice: typeof AUTH_NOTICE_SIGN_IN_CANCELLED_VALUE;
};

const AUTH_NOTICE_MESSAGES: Record<
	typeof AUTH_NOTICE_SIGN_IN_CANCELLED_VALUE,
	string
> = {
	[AUTH_NOTICE_SIGN_IN_CANCELLED_VALUE]: AUTH_NOTICE_SIGN_IN_CANCELLED_MESSAGE
};

export function readAuthNotice(
	searchParams: URLSearchParams
): AuthNotice | null {
	const notice = searchParams.get(AUTH_NOTICE_QUERY_NAME);
	if (notice !== AUTH_NOTICE_SIGN_IN_CANCELLED_VALUE) {
		return null;
	}

	return {
		message: AUTH_NOTICE_MESSAGES[notice],
		incidentId: null
	};
}

export function clearAuthNoticeQuery(searchParams: URLSearchParams): void {
	searchParams.delete(AUTH_NOTICE_QUERY_NAME);
}

export function buildAuthNoticeLandingRedirectLocation({
	origin,
	notice
}: BuildAuthNoticeLandingRedirectLocationOptions): string {
	const landingUrl = new URL('/', normalizeConfiguredOrigin(origin, 'origin'));
	landingUrl.searchParams.set(AUTH_NOTICE_QUERY_NAME, notice);
	return landingUrl.toString();
}
