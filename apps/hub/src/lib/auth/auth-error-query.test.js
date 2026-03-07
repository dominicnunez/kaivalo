import { describe, expect, it } from 'vitest';
import {
	AUTH_ERROR_INCIDENT_QUERY_NAME,
	AUTH_ERROR_QUERY_NAME,
	AUTH_ERROR_QUERY_TTL_MS,
	AUTH_ERROR_QUERY_VALUE,
	AUTH_ERROR_SIGNATURE_QUERY_NAME,
	AUTH_ERROR_TIMESTAMP_QUERY_NAME,
	AUTH_ERROR_MESSAGE,
	buildAuthErrorRedirectQuery,
	readVerifiedAuthError
} from './auth-error-query.js';

const cookiePassword = 'ab'.repeat(32);
const incidentId = 'authcb_123e4567-e89b-12d3-a456-426614174000';
const issuedAt = 1_710_000_000_000;

function buildSearchParams(now = issuedAt) {
	return new URLSearchParams(
		buildAuthErrorRedirectQuery({
			incidentId,
			secret: cookiePassword,
			now
		})
	);
}

/**
 * @typedef {(searchParams: URLSearchParams) => void} SearchParamsMutator
 */

describe('readVerifiedAuthError', () => {
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

	/** @type {Array<[string, SearchParamsMutator]>} */
	const rejectionCases = [
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
			'future timestamp',
			(searchParams) =>
				searchParams.set(AUTH_ERROR_TIMESTAMP_QUERY_NAME, String(issuedAt + 1))
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
});
