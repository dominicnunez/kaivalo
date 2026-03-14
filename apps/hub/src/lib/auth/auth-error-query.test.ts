import { describe, expect, it } from 'vitest';
import {
	AUTH_ERROR_INCIDENT_QUERY_NAME,
	AUTH_ERROR_MAX_FUTURE_SKEW_MS,
	AUTH_ERROR_QUERY_NAME,
	AUTH_ERROR_QUERY_TTL_MS,
	AUTH_ERROR_QUERY_VALUE,
	AUTH_ERROR_SIGNATURE_QUERY_NAME,
	AUTH_ERROR_TIMESTAMP_QUERY_NAME,
	AUTH_ERROR_MESSAGE,
	buildAuthErrorLandingRedirectLocation,
	buildAuthErrorRedirectQuery,
	clearAuthErrorQuery,
	readAuthErrorRedirectShape,
	readVerifiedAuthError
} from './auth-error-query.ts';

const cookiePassword = 'ab'.repeat(32);
const incidentId = 'authcb_123e4567-e89b-12d3-a456-426614174000';
const issuedAt = 1_710_000_000_000;

type SearchParamsMutator = (searchParams: URLSearchParams) => void;

function buildSearchParams(now = issuedAt) {
	return new URLSearchParams(
		buildAuthErrorRedirectQuery({
			incidentId,
			secret: cookiePassword,
			now
		})
	);
}

describe('readVerifiedAuthError', () => {
	it.each([
		'',
		'not-an-incident-id',
		'authlayout_123e4567-e89b-12d3-a456-426614174000'
	])('rejects malformed auth incident ids when signing: %s', (badId) => {
		expect(() =>
			buildAuthErrorRedirectQuery({
				incidentId: badId,
				secret: cookiePassword,
				now: issuedAt
			})
		).toThrowError('incidentId must be a valid auth incident id');
	});

	it.each(['', '   '])(
		'rejects empty signing secret when building redirect query: %j',
		(invalidSecret) => {
			expect(() =>
				buildAuthErrorRedirectQuery({
					incidentId,
					secret: invalidSecret,
					now: issuedAt
				})
			).toThrowError('secret must be a non-empty string');
		}
	);

	it('accepts a signed auth error at the ttl boundary', () => {
		const searchParams = buildSearchParams();

		expect(
			readVerifiedAuthError(searchParams, {
				secret: cookiePassword,
				now: issuedAt + AUTH_ERROR_QUERY_TTL_MS
			})
		).toEqual({
			message: AUTH_ERROR_MESSAGE,
			incidentId
		});
	});

	it('rejects signed auth errors once they are older than the ttl', () => {
		const searchParams = buildSearchParams();

		expect(
			readVerifiedAuthError(searchParams, {
				secret: cookiePassword,
				now: issuedAt + AUTH_ERROR_QUERY_TTL_MS + 1
			})
		).toBeNull();
	});

	it('accepts signed auth errors within the bounded future skew window', () => {
		const searchParams = buildSearchParams(
			issuedAt + AUTH_ERROR_MAX_FUTURE_SKEW_MS
		);

		expect(
			readVerifiedAuthError(searchParams, {
				secret: cookiePassword,
				now: issuedAt
			})
		).toEqual({
			message: AUTH_ERROR_MESSAGE,
			incidentId
		});
	});

	it('rejects signed auth errors beyond the bounded future skew window', () => {
		const searchParams = buildSearchParams(
			issuedAt + AUTH_ERROR_MAX_FUTURE_SKEW_MS + 1
		);

		expect(
			readVerifiedAuthError(searchParams, {
				secret: cookiePassword,
				now: issuedAt
			})
		).toBeNull();
	});

	const rejectionCases: Array<[string, SearchParamsMutator]> = [
		[
			'missing auth marker',
			(searchParams) => searchParams.delete(AUTH_ERROR_QUERY_NAME)
		],
		[
			'unexpected auth marker',
			(searchParams) => searchParams.set(AUTH_ERROR_QUERY_NAME, 'nope')
		],
		[
			'missing incident id',
			(searchParams) => searchParams.delete(AUTH_ERROR_INCIDENT_QUERY_NAME)
		],
		[
			'malformed incident id',
			(searchParams) =>
				searchParams.set(
					AUTH_ERROR_INCIDENT_QUERY_NAME,
					'authcb_not-a-valid-incident'
				)
		],
		[
			'missing timestamp',
			(searchParams) => searchParams.delete(AUTH_ERROR_TIMESTAMP_QUERY_NAME)
		],
		[
			'non-numeric timestamp',
			(searchParams) =>
				searchParams.set(AUTH_ERROR_TIMESTAMP_QUERY_NAME, 'not-a-number')
		],
		[
			'unsafe integer timestamp',
			(searchParams) =>
				searchParams.set(
					AUTH_ERROR_TIMESTAMP_QUERY_NAME,
					String(Number.MAX_SAFE_INTEGER + 1)
				)
		],
		[
			'missing signature',
			(searchParams) => searchParams.delete(AUTH_ERROR_SIGNATURE_QUERY_NAME)
		],
		[
			'forged signature',
			(searchParams) =>
				searchParams.set(AUTH_ERROR_SIGNATURE_QUERY_NAME, 'forged')
		]
	];

	it.each(rejectionCases)('rejects %s', (_label, mutateSearchParams) => {
		const searchParams = buildSearchParams();
		mutateSearchParams(searchParams);

		expect(
			readVerifiedAuthError(searchParams, {
				secret: cookiePassword,
				now: issuedAt
			})
		).toBeNull();
	});

	it.each(['', '   '])(
		'rejects empty signing secret value %j',
		(invalidSecret) => {
			expect(
				readVerifiedAuthError(buildSearchParams(), {
					secret: invalidSecret,
					now: issuedAt
				})
			).toBeNull();
		}
	);

	it('rejects when the incident id and timestamp are re-signed with a different secret', () => {
		const query = buildAuthErrorRedirectQuery({
			incidentId,
			secret: 'cd'.repeat(32),
			now: issuedAt
		});

		expect(
			readVerifiedAuthError(new URLSearchParams(query), {
				secret: cookiePassword,
				now: issuedAt
			})
		).toBeNull();
	});

	it('rejects when timestamp tampering leaves the original signature in place', () => {
		const searchParams = buildSearchParams();
		searchParams.set(AUTH_ERROR_TIMESTAMP_QUERY_NAME, String(issuedAt - 1));

		expect(
			readVerifiedAuthError(searchParams, {
				secret: cookiePassword,
				now: issuedAt
			})
		).toBeNull();
	});

	it('produces a stable message for verified errors', () => {
		expect(
			readVerifiedAuthError(buildSearchParams(), {
				secret: cookiePassword,
				now: issuedAt
			})
		).toEqual({
			message: AUTH_ERROR_MESSAGE,
			incidentId
		});
		expect(AUTH_ERROR_QUERY_VALUE).toBe('auth');
	});

	it('normalizes surrounding whitespace on the signing secret', () => {
		const query = buildAuthErrorRedirectQuery({
			incidentId,
			secret: `  ${cookiePassword}  `,
			now: issuedAt
		});

		expect(
			readVerifiedAuthError(new URLSearchParams(query), {
				secret: `  ${cookiePassword}  `,
				now: issuedAt
			})
		).toEqual({
			message: AUTH_ERROR_MESSAGE,
			incidentId
		});
	});

	it('accepts signed sign-in incident ids', () => {
		const signInIncidentId = 'authsign_123e4567-e89b-12d3-a456-426614174000';
		const query = buildAuthErrorRedirectQuery({
			incidentId: signInIncidentId,
			secret: cookiePassword,
			now: issuedAt
		});

		expect(
			readVerifiedAuthError(new URLSearchParams(query), {
				secret: cookiePassword,
				now: issuedAt
			})
		).toEqual({
			message: AUTH_ERROR_MESSAGE,
			incidentId: signInIncidentId
		});
	});

	it('builds an absolute landing-page redirect on the configured origin', () => {
		const location = buildAuthErrorLandingRedirectLocation({
			incidentId,
			secret: cookiePassword,
			origin: 'https://kaivalo.test',
			now: issuedAt
		});

		const parsedLocation = new URL(location);
		expect(parsedLocation.origin).toBe('https://kaivalo.test');
		expect(parsedLocation.pathname).toBe('/');
		expect(
			readVerifiedAuthError(parsedLocation.searchParams, {
				secret: cookiePassword,
				now: issuedAt
			})
		).toEqual({
			message: AUTH_ERROR_MESSAGE,
			incidentId
		});
	});

	it('rejects malformed landing-page origins', () => {
		expect(() =>
			buildAuthErrorLandingRedirectLocation({
				incidentId,
				secret: cookiePassword,
				origin: 'https://kaivalo.test/services',
				now: issuedAt
			})
		).toThrowError('origin must be a valid URL origin');
	});
});

describe('readAuthErrorRedirectShape', () => {
	it('accepts a structurally valid auth error redirect query', () => {
		expect(readAuthErrorRedirectShape(buildSearchParams())).toEqual({
			incidentId,
			signature: expect.stringMatching(/^[A-Za-z0-9_-]+$/),
			timestamp: String(issuedAt)
		});
	});

	it.each([
		[
			'missing auth marker',
			(searchParams: URLSearchParams) =>
				searchParams.delete(AUTH_ERROR_QUERY_NAME)
		],
		[
			'unexpected auth marker',
			(searchParams: URLSearchParams) =>
				searchParams.set(AUTH_ERROR_QUERY_NAME, 'nope')
		],
		[
			'malformed incident id',
			(searchParams: URLSearchParams) =>
				searchParams.set(
					AUTH_ERROR_INCIDENT_QUERY_NAME,
					'authcb_not-a-valid-incident'
				)
		],
		[
			'non-numeric timestamp',
			(searchParams: URLSearchParams) =>
				searchParams.set(AUTH_ERROR_TIMESTAMP_QUERY_NAME, 'not-a-number')
		],
		[
			'unsafe integer timestamp',
			(searchParams: URLSearchParams) =>
				searchParams.set(
					AUTH_ERROR_TIMESTAMP_QUERY_NAME,
					String(Number.MAX_SAFE_INTEGER + 1)
				)
		],
		[
			'missing signature',
			(searchParams: URLSearchParams) =>
				searchParams.delete(AUTH_ERROR_SIGNATURE_QUERY_NAME)
		],
		[
			'malformed signature',
			(searchParams: URLSearchParams) =>
				searchParams.set(AUTH_ERROR_SIGNATURE_QUERY_NAME, 'bad signature')
		]
	])('rejects %s', (_label, mutateSearchParams) => {
		const searchParams = buildSearchParams();
		mutateSearchParams(searchParams);

		expect(readAuthErrorRedirectShape(searchParams)).toBeNull();
	});
});

describe('clearAuthErrorQuery', () => {
	it('removes only the signed auth error query payload', () => {
		const searchParams = buildSearchParams();
		searchParams.set('next', '/dashboard');

		clearAuthErrorQuery(searchParams);

		expect(searchParams.has(AUTH_ERROR_QUERY_NAME)).toBe(false);
		expect(searchParams.has(AUTH_ERROR_INCIDENT_QUERY_NAME)).toBe(false);
		expect(searchParams.has(AUTH_ERROR_TIMESTAMP_QUERY_NAME)).toBe(false);
		expect(searchParams.has(AUTH_ERROR_SIGNATURE_QUERY_NAME)).toBe(false);
		expect(searchParams.get('next')).toBe('/dashboard');
	});
});
