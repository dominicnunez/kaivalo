import { describe, expect, it } from 'vitest';
import { getErrorLogContext } from './error-diagnostics.ts';

describe('error log diagnostics', () => {
	it('redacts sensitive messages when log messages are enabled', () => {
		const cause = Object.assign(
			new Error(
				'upstream payload {"refresh_token":"refresh-secret","password":"super-secret"}'
			),
			{
				code: 'UPSTREAM_TIMEOUT'
			}
		);
		const context = getErrorLogContext(
			Object.assign(
				new Error(
					'request failed with {"access_token":"access-secret","client_secret":"client-secret"}'
				),
				{
					code: 'WORKOS_FETCH_FAILED',
					cause
				}
			),
			{ includeMessage: true }
		);

		expect(context).toEqual({
			errorName: 'Error',
			errorUpstreamCode: 'WORKOS_FETCH_FAILED',
			errorCauseName: 'Error',
			errorCauseCode: 'UPSTREAM_TIMEOUT',
			errorMessage:
				'request failed with {"access_token":[redacted],"client_secret":[redacted]}',
			errorCauseMessage:
				'upstream payload {"refresh_token":[redacted],"password":[redacted]}'
		});
	});

	it('omits sensitive messages when log messages are disabled', () => {
		const cause = Object.assign(
			new Error('oauth code=secret-code should not leak'),
			{
				code: 'UPSTREAM_TIMEOUT'
			}
		);
		const context = getErrorLogContext(
			Object.assign(new Error('request failed with token=super-secret'), {
				code: 'WORKOS_FETCH_FAILED',
				cause
			}),
			{ includeMessage: false }
		);

		expect(context).toEqual({
			errorName: 'Error',
			errorUpstreamCode: 'WORKOS_FETCH_FAILED',
			errorCauseName: 'Error',
			errorCauseCode: 'UPSTREAM_TIMEOUT'
		});
	});
});
