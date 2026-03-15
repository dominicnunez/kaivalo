import { describe, expect, it } from 'vitest';
import {
	AUTH_NOTICE_QUERY_NAME,
	AUTH_NOTICE_SIGN_IN_CANCELLED_MESSAGE,
	AUTH_NOTICE_SIGN_IN_CANCELLED_VALUE,
	buildAuthNoticeLandingRedirectLocation,
	clearAuthNoticeQuery,
	readAuthNotice
} from './auth-notice-query.ts';

describe('auth notice query', () => {
	it('reads the sign-in cancelled notice from the landing page query', () => {
		const searchParams = new URLSearchParams({
			[AUTH_NOTICE_QUERY_NAME]: AUTH_NOTICE_SIGN_IN_CANCELLED_VALUE
		});

		expect(readAuthNotice(searchParams)).toEqual({
			message: AUTH_NOTICE_SIGN_IN_CANCELLED_MESSAGE,
			incidentId: null
		});
	});

	it('ignores unknown auth notice values', () => {
		expect(
			readAuthNotice(
				new URLSearchParams({
					[AUTH_NOTICE_QUERY_NAME]: 'unknown'
				})
			)
		).toBeNull();
	});

	it('builds an absolute landing-page notice redirect on the configured origin', () => {
		const location = buildAuthNoticeLandingRedirectLocation({
			origin: 'https://kaivalo.test',
			notice: AUTH_NOTICE_SIGN_IN_CANCELLED_VALUE
		});
		const parsedLocation = new URL(location);

		expect(parsedLocation.origin).toBe('https://kaivalo.test');
		expect(parsedLocation.pathname).toBe('/');
		expect(parsedLocation.searchParams.get(AUTH_NOTICE_QUERY_NAME)).toBe(
			AUTH_NOTICE_SIGN_IN_CANCELLED_VALUE
		);
	});

	it('rejects malformed landing-page origins', () => {
		expect(() =>
			buildAuthNoticeLandingRedirectLocation({
				origin: 'https://kaivalo.test/services',
				notice: AUTH_NOTICE_SIGN_IN_CANCELLED_VALUE
			})
		).toThrowError('origin must be a valid URL origin');
	});

	it('removes only the auth notice query payload', () => {
		const searchParams = new URLSearchParams({
			[AUTH_NOTICE_QUERY_NAME]: AUTH_NOTICE_SIGN_IN_CANCELLED_VALUE,
			next: '/services'
		});

		clearAuthNoticeQuery(searchParams);

		expect(searchParams.has(AUTH_NOTICE_QUERY_NAME)).toBe(false);
		expect(searchParams.get('next')).toBe('/services');
	});
});
