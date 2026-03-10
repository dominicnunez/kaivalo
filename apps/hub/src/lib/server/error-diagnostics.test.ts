import { describe, expect, it } from 'vitest';
import {
	getErrorDiagnostics,
	getErrorLogContext
} from './error-diagnostics.ts';

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

	it('redacts cookie and authorization header values from logged messages', () => {
		const cause = new Error(
			'upstream request failed with Cookie: sid=abc123; refresh=def456 Authorization: Basic dXNlcjpwYXNz'
		);
		const context = getErrorLogContext(
			Object.assign(
				new Error(
					'request failed with Set-Cookie: sid=abc123; Expires=Wed, 21 Oct 2015 07:28:00 GMT; HttpOnly Authorization: Bearer access-secret'
				),
				{
					cause
				}
			),
			{ includeMessage: true }
		);

		expect(context.errorMessage).toBe(
			'request failed with Set-Cookie: [redacted] Authorization: [redacted]'
		);
		expect(context.errorCauseMessage).toBe(
			'upstream request failed with Cookie: [redacted] Authorization: [redacted]'
		);
	});

	it('redacts header-style credentials from diagnostics payloads', () => {
		const diagnostics = getErrorDiagnostics(
			new Error(
				'request failed with Cookie: sid=abc123; refresh=def456 Set-Cookie: sid=abc123; HttpOnly Authorization: Basic dXNlcjpwYXNz'
			),
			{ includeSensitiveDetails: true }
		);

		expect(diagnostics).toEqual(
			expect.objectContaining({
				type: 'Error',
				message:
					'request failed with Cookie: [redacted] Set-Cookie: [redacted] Authorization: [redacted]'
			})
		);
	});
});
