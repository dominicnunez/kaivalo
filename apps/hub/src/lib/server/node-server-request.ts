import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { normalizeRequestId } from '../auth/log-context.ts';
import { canonicalizeIpAddress } from './ip-address.ts';
import {
	getErrorDiagnostics,
	type ErrorDiagnostics
} from './error-diagnostics.ts';
import { getTrustedForwardedProto } from './workos-security-cache.ts';

const PRODUCTION_NODE_ENV = 'production';

type Env = Record<string, string | undefined>;

type SecureRequestEvaluation = {
	isSecure: boolean;
	ignoredForwardedProto: boolean;
	remoteAddress: string;
	forwardedProto: string;
};

function shouldIncludeSensitiveErrorDetails(env: Env): boolean {
	return env.NODE_ENV?.trim().toLowerCase() !== PRODUCTION_NODE_ENV;
}

function readSingleHeaderValue(
	value: string | string[] | undefined
): string | null {
	if (typeof value === 'string') {
		return value;
	}
	if (Array.isArray(value)) {
		return value[0] ?? null;
	}
	return null;
}

export function getRequestPathname(req: http.IncomingMessage): string {
	if (!req.url) {
		return '/';
	}

	try {
		return new URL(req.url, 'http://localhost').pathname;
	} catch {
		return '/';
	}
}

export function evaluateSecureRequest(
	req: http.IncomingMessage,
	trustForwardedProto: boolean,
	trustedProxyIpSet: Set<string>
): SecureRequestEvaluation {
	const remoteAddress = canonicalizeIpAddress(req.socket?.remoteAddress);
	const forwardedProto = getTrustedForwardedProto(
		req.headers['x-forwarded-proto']
	);

	if (trustForwardedProto && forwardedProto) {
		if (remoteAddress && trustedProxyIpSet.has(remoteAddress)) {
			return {
				isSecure: forwardedProto === 'https',
				ignoredForwardedProto: false,
				remoteAddress,
				forwardedProto
			};
		}

		return {
			isSecure: req.socket
				? 'encrypted' in req.socket && req.socket.encrypted === true
				: false,
			ignoredForwardedProto: true,
			remoteAddress,
			forwardedProto
		};
	}

	return {
		isSecure: req.socket
			? 'encrypted' in req.socket && req.socket.encrypted === true
			: false,
		ignoredForwardedProto: false,
		remoteAddress,
		forwardedProto
	};
}

export function buildRequestFailureLog(
	req: http.IncomingMessage,
	error: unknown,
	env: Env
): {
	incidentId: string;
	method?: string;
	pathname: string;
	requestId: string;
	remoteAddress: string;
	error: ErrorDiagnostics;
} {
	const incidentId = randomUUID();
	return {
		incidentId,
		method: req.method,
		pathname: getRequestPathname(req),
		requestId: normalizeRequestId(
			readSingleHeaderValue(req.headers?.['x-request-id'])
		),
		remoteAddress:
			canonicalizeIpAddress(req.socket?.remoteAddress) ?? 'unknown',
		error: getErrorDiagnostics(error, {
			includeSensitiveDetails: shouldIncludeSensitiveErrorDetails(env)
		})
	};
}
