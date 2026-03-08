export const AUTH_ERROR_QUERY_NAME = 'error';
export const AUTH_ERROR_QUERY_VALUE = 'auth';
export const AUTH_ERROR_INCIDENT_QUERY_NAME = 'incident';
export const AUTH_ERROR_TIMESTAMP_QUERY_NAME = 'ts';
export const AUTH_ERROR_SIGNATURE_QUERY_NAME = 'sig';
export const AUTH_ERROR_MESSAGE =
	'Sign-in is temporarily unavailable. Please try again shortly.';

const AUTH_ERROR_QUERY_PARAM_NAMES = [
	AUTH_ERROR_QUERY_NAME,
	AUTH_ERROR_INCIDENT_QUERY_NAME,
	AUTH_ERROR_TIMESTAMP_QUERY_NAME,
	AUTH_ERROR_SIGNATURE_QUERY_NAME
];

/**
 * @param {URLSearchParams} searchParams
 * @returns {void}
 */
export function clearAuthErrorQuery(searchParams) {
	for (const queryName of AUTH_ERROR_QUERY_PARAM_NAMES) {
		searchParams.delete(queryName);
	}
}
