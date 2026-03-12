import {
	canonicalizeIpAddress,
	isLoopbackHostname,
	isLoopbackIpAddress
} from './ip-address.ts';
import { parseCanonicalHostname } from '../hostname.ts';

const REQUIRED_ENV_VARS = [
	'WORKOS_CLIENT_ID',
	'WORKOS_API_KEY',
	'WORKOS_REDIRECT_URI',
	'WORKOS_COOKIE_PASSWORD',
	'AUTH_ERROR_SIGNING_SECRET'
];
const HEX_64_PATTERN = /^[a-f0-9]{64}$/i;
const DEFAULT_WORKOS_API_HOSTNAME = 'api.workos.com';
const WORKOS_REDIRECT_PATHNAME = '/auth/callback';
export const PROXY_HSTS_CONFIGURATION_ERROR_MESSAGE =
	'Production HTTPS origin requires trusted proxy proto forwarding for reliable HSTS. Set TRUST_X_FORWARDED_PROTO=true and TRUSTED_PROXY_IPS to trusted proxy addresses for proxied HTTPS deployments.';
export const LOOPBACK_PROXY_TRUST_ERROR_MESSAGE =
	'Production HTTPS origin is configured to trust forwarded proto headers from loopback-only proxy IPs. This commonly indicates misconfigured TRUSTED_PROXY_IPS and can suppress HSTS for real client traffic.';

type Env = Record<string, string | undefined>;

type WorkosEnv = {
	clientId: string;
	apiKey: string;
	redirectUri: string;
	cookiePassword: string;
	authErrorSigningSecret: string;
	origin: string;
	apiHostname: string;
};

function parseRedirectUrl(value: string): URL {
	try {
		const parsed = new URL(value);
		if (parsed.username || parsed.password) {
			throw new Error();
		}
		if (
			parsed.pathname !== WORKOS_REDIRECT_PATHNAME ||
			parsed.search ||
			parsed.hash
		) {
			throw new Error();
		}

		return parsed;
	} catch {
		throw new Error(
			'WORKOS_REDIRECT_URI must be a valid absolute callback URL'
		);
	}
}

function parseOriginUrl(value: string): URL {
	try {
		const parsed = new URL(value);
		if (parsed.username || parsed.password) {
			throw new Error();
		}

		if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
			throw new Error();
		}

		return parsed;
	} catch {
		throw new Error(
			'ORIGIN must be a valid URL origin (for example: https://hub.kaivalo.com)'
		);
	}
}

function assertHttpOrHttpsProtocol(url: URL, envVarName: string): void {
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(`${envVarName} must use http or https`);
	}
}

function parseWorkosHostname(
	value: string | undefined,
	envVarName: string,
	defaultHostname: string
): string {
	const trimmed = value?.trim();
	if (!trimmed) {
		return defaultHostname;
	}

	if (
		trimmed.includes('://') ||
		trimmed.includes('/') ||
		trimmed.includes('?') ||
		trimmed.includes('#') ||
		trimmed.includes('@') ||
		trimmed.includes(':')
	) {
		throw new Error(
			`${envVarName} must be a hostname without protocol, path, credentials, or port`
		);
	}

	try {
		const parsedHostname = parseCanonicalHostname(trimmed);
		if (!parsedHostname) {
			throw new Error();
		}

		return parsedHostname;
	} catch {
		throw new Error(
			`${envVarName} must be a hostname without protocol, path, credentials, or port`
		);
	}
}

function isLocalRedirectUrl(redirectUrl: URL): boolean {
	return isLoopbackHostname(redirectUrl.hostname);
}

function getEffectivePort(url: URL): string {
	if (url.port) {
		return url.port;
	}

	if (url.protocol === 'https:') {
		return '443';
	}
	if (url.protocol === 'http:') {
		return '80';
	}

	return '';
}

function hasEquivalentOrigin(left: URL, right: URL): boolean {
	if (left.origin === right.origin) {
		return true;
	}

	if (!isLocalRedirectUrl(left) || !isLocalRedirectUrl(right)) {
		return false;
	}

	return (
		left.protocol === right.protocol &&
		getEffectivePort(left) === getEffectivePort(right)
	);
}

function isTestEnvironment(nodeEnv: string | undefined): boolean {
	return nodeEnv?.trim() === 'test';
}

function parseTrustedProxyIps(
	trustedProxyIpsValue: string | undefined
): string[] {
	const entries =
		trustedProxyIpsValue
			?.split(',')
			.map((value: string) => value.trim())
			.filter((value: string) => value.length > 0) ?? [];

	return entries.map((entry: string) => {
		const canonical = canonicalizeIpAddress(entry);
		if (!canonical) {
			throw new Error(
				`TRUSTED_PROXY_IPS contains invalid IP address: ${entry}`
			);
		}
		return canonical;
	});
}

function isLocalOrigin(origin: string): boolean {
	try {
		return isLocalRedirectUrl(new URL(origin));
	} catch {
		return false;
	}
}

function readRequiredTrimmedEnvValue(env: Env, name: string): string {
	const value = env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

export function getValidatedWorkosEnv(env: Env): WorkosEnv {
	for (const name of REQUIRED_ENV_VARS) {
		if (!env[name]?.trim()) {
			throw new Error(`Missing required environment variable: ${name}`);
		}
	}

	const clientId = readRequiredTrimmedEnvValue(env, 'WORKOS_CLIENT_ID');
	const apiKey = readRequiredTrimmedEnvValue(env, 'WORKOS_API_KEY');
	const redirectUriValue = readRequiredTrimmedEnvValue(
		env,
		'WORKOS_REDIRECT_URI'
	);
	const cookiePassword = readRequiredTrimmedEnvValue(
		env,
		'WORKOS_COOKIE_PASSWORD'
	);
	const authErrorSigningSecret = readRequiredTrimmedEnvValue(
		env,
		'AUTH_ERROR_SIGNING_SECRET'
	);
	const apiHostname = parseWorkosHostname(
		env.WORKOS_API_HOSTNAME,
		'WORKOS_API_HOSTNAME',
		DEFAULT_WORKOS_API_HOSTNAME
	);

	if (!HEX_64_PATTERN.test(cookiePassword)) {
		throw new Error(
			'WORKOS_COOKIE_PASSWORD must be 64 hex characters (openssl rand -hex 32)'
		);
	}
	if (!HEX_64_PATTERN.test(authErrorSigningSecret)) {
		throw new Error(
			'AUTH_ERROR_SIGNING_SECRET must be 64 hex characters (openssl rand -hex 32)'
		);
	}

	const redirectUrl = parseRedirectUrl(redirectUriValue);
	assertHttpOrHttpsProtocol(redirectUrl, 'WORKOS_REDIRECT_URI');
	if (redirectUrl.protocol !== 'https:' && !isLocalRedirectUrl(redirectUrl)) {
		throw new Error(
			'WORKOS_REDIRECT_URI must use https outside local development'
		);
	}

	const originValue = env.ORIGIN?.trim();
	if (!originValue) {
		if (!isTestEnvironment(env.NODE_ENV)) {
			throw new Error('Missing required environment variable: ORIGIN');
		}

		const localOrigin = `${redirectUrl.protocol}//${redirectUrl.host}`;
		return {
			clientId,
			apiKey,
			redirectUri: redirectUrl.toString(),
			cookiePassword,
			authErrorSigningSecret,
			origin: localOrigin,
			apiHostname
		};
	}

	const originUrl = parseOriginUrl(originValue);
	assertHttpOrHttpsProtocol(originUrl, 'ORIGIN');
	if (originUrl.protocol !== 'https:' && !isLocalRedirectUrl(originUrl)) {
		throw new Error('ORIGIN must use https outside local development');
	}
	if (!hasEquivalentOrigin(originUrl, redirectUrl)) {
		throw new Error('ORIGIN must match WORKOS_REDIRECT_URI origin');
	}

	return {
		clientId,
		apiKey,
		redirectUri: redirectUrl.toString(),
		cookiePassword,
		authErrorSigningSecret,
		origin: originUrl.origin,
		apiHostname
	};
}

export function assertValidWorkosEnv(env: Env): void {
	getValidatedWorkosEnv(env);
}

export function getProxyTrustConfiguration(
	env: Env,
	origin: string
): { trustForwardedProto: boolean; trustedProxyIps: string[] } {
	const trustForwardedProto =
		env.TRUST_X_FORWARDED_PROTO?.trim().toLowerCase() === 'true';
	const trustedProxyIps = trustForwardedProto
		? parseTrustedProxyIps(env.TRUSTED_PROXY_IPS)
		: [];
	const isProduction = env.NODE_ENV?.trim().toLowerCase() === 'production';

	if (trustForwardedProto && trustedProxyIps.length === 0) {
		throw new Error(
			'TRUSTED_PROXY_IPS must be configured when TRUST_X_FORWARDED_PROTO=true'
		);
	}
	if (isProduction && !trustForwardedProto && origin.startsWith('https://')) {
		throw new Error(PROXY_HSTS_CONFIGURATION_ERROR_MESSAGE);
	}
	if (
		isProduction &&
		trustForwardedProto &&
		origin.startsWith('https://') &&
		!isLocalOrigin(origin)
	) {
		const hasOnlyLoopbackTrustedProxies =
			trustedProxyIps.length > 0 &&
			trustedProxyIps.every((ipAddress: string) =>
				isLoopbackIpAddress(ipAddress)
			);
		if (hasOnlyLoopbackTrustedProxies) {
			throw new Error(LOOPBACK_PROXY_TRUST_ERROR_MESSAGE);
		}
	}

	return { trustForwardedProto, trustedProxyIps };
}
