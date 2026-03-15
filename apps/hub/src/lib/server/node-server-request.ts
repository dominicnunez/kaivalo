import http from 'node:http';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { canonicalizeIpAddress } from './ip-address.ts';
import {
	getErrorDiagnostics,
	type ErrorDiagnostics
} from './error-diagnostics.ts';
import { normalizeRequestId } from './request-id.ts';
import { getTrustedClientAddress } from './trusted-client-address.ts';
import { getTrustedForwardedProto } from './workos-security-cache.ts';
import {
	getProxyTrustConfiguration,
	getValidatedWorkosEnv
} from './workos-security.ts';

const PRODUCTION_NODE_ENV = 'production';
const UNKNOWN_ADDRESS = 'unknown';
const REDACTED_NETWORK_IDENTIFIER_LENGTH = 16;
const NETWORK_LOG_REDACTION_KEY = randomBytes(32);

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

export function redactLoggedNetworkIdentifier(
	value: string | undefined | null
): string {
	const normalized = canonicalizeIpAddress(value);
	if (!normalized) {
		return UNKNOWN_ADDRESS;
	}

	const family = normalized.includes(':') ? 'ipv6' : 'ipv4';
	const fingerprint = createHmac('sha256', NETWORK_LOG_REDACTION_KEY)
		.update(normalized)
		.digest('hex')
		.slice(0, REDACTED_NETWORK_IDENTIFIER_LENGTH);
	return `${family}_${fingerprint}`;
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
	clientAddress: string;
	remoteAddress: string;
	error: ErrorDiagnostics;
} {
	const incidentId = randomUUID();
	const remoteAddress =
		canonicalizeIpAddress(req.socket?.remoteAddress) || UNKNOWN_ADDRESS;
	const clientAddress = (() => {
		try {
			const { trustForwardedProto, trustedProxyIps } =
				getProxyTrustConfiguration(env, getValidatedWorkosEnv(env).origin);
			if (!trustForwardedProto) {
				return remoteAddress;
			}

			return (
				getTrustedClientAddress({
					directClientAddress:
						remoteAddress === UNKNOWN_ADDRESS ? '' : remoteAddress,
					forwardedForHeader: readSingleHeaderValue(
						req.headers?.['x-forwarded-for']
					),
					trustedProxyIps
				}) || UNKNOWN_ADDRESS
			);
		} catch {
			return remoteAddress;
		}
	})();
	return {
		incidentId,
		method: req.method,
		pathname: getRequestPathname(req),
		requestId: normalizeRequestId(
			readSingleHeaderValue(req.headers?.['x-request-id'])
		),
		clientAddress: redactLoggedNetworkIdentifier(clientAddress),
		remoteAddress: redactLoggedNetworkIdentifier(remoteAddress),
		error: getErrorDiagnostics(error, {
			includeSensitiveDetails: shouldIncludeSensitiveErrorDetails(env)
		})
	};
}
