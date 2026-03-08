import { canonicalizeIpAddress } from './ip-address.js';
import { SENSITIVE_AUTH_COOKIE_NAMES } from './auth-cookie-names.js';
import type { Handle, RequestEvent } from '@sveltejs/kit';
import type http from 'node:http';

const REQUIRED_ENV_VARS = [
	'WORKOS_CLIENT_ID',
	'WORKOS_API_KEY',
	'WORKOS_REDIRECT_URI',
	'WORKOS_COOKIE_PASSWORD'
];
const HEX_64_PATTERN = /^[a-f0-9]{64}$/i;
const HSTS_MAX_AGE_SECONDS = 63_072_000;
const LOCAL_REDIRECT_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const DEFAULT_WORKOS_API_HOSTNAME = 'api.workos.com';
const AUTH_ROUTE_PATH_PREFIX = '/auth/';
const PUBLIC_DOCUMENT_CACHE_CONTROL =
	'public, max-age=300, stale-while-revalidate=60';
const SENSITIVE_DOCUMENT_CACHE_CONTROL = 'private, no-store';
const STATIC_IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const STATIC_ROOT_ASSET_CACHE_CONTROL =
	'public, max-age=86400, stale-while-revalidate=600';
const STATIC_FONT_ASSET_CACHE_CONTROL =
	'public, max-age=604800, stale-while-revalidate=86400';
const CACHE_VARY_COOKIE_HEADER = 'Cookie';
const CACHE_VARY_AUTHORIZATION_HEADER = 'Authorization';
const WORKOS_REDIRECT_PATHNAME = '/auth/callback';
const FORWARDED_PROTO_HEADER = 'x-forwarded-proto';
const HTTPS_PROTO = 'https';
const HTTP_PROTO = 'http';
const ROOT_STATIC_ASSET_PATHS = new Set([
	'/favicon.ico',
	'/favicon.svg',
	'/favicon-192.png',
	'/favicon-512.png',
	'/og-image.png',
	'/robots.txt',
	'/sitemap.xml',
	'/site.webmanifest'
]);
const FONT_ASSET_PATH_PREFIX = '/fonts/';
const STATIC_ASSET_RESPONSE_CONTENT_TYPE_PREFIXES = [
	'image/',
	'font/',
	'audio/',
	'video/'
];
const STATIC_ASSET_RESPONSE_CONTENT_TYPES = new Set([
	'application/font-woff',
	'application/javascript',
	'application/manifest+json',
	'application/octet-stream',
	'application/wasm',
	'application/xml',
	'text/css',
	'text/javascript',
	'text/plain',
	'text/xml'
]);
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
	origin: string;
	apiHostname: string;
};

type StaticAssetCacheControlOptions = {
	pathname: string | undefined | null;
	statusCode?: number;
	contentType?: string | null;
	hasSetCookie?: boolean;
};

type SecurityHeadersTarget = Headers | http.ServerResponse;

type SecurityHeadersOptions = {
	trustForwardedProto?: boolean;
	trustedProxyIps?: Iterable<string>;
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
			'ORIGIN must be a valid URL origin (for example: https://kaivalo.com)'
		);
	}
}

function assertHttpOrHttpsProtocol(url: URL, envVarName: string): void {
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(`${envVarName} must use http or https`);
	}
}

function parseWorkosApiHostname(value: string | undefined): string {
	const trimmed = value?.trim();
	if (!trimmed) {
		return DEFAULT_WORKOS_API_HOSTNAME;
	}

	if (
		trimmed.includes('://') ||
		trimmed.includes('/') ||
		trimmed.includes('?') ||
		trimmed.includes('#') ||
		trimmed.includes('@')
	) {
		throw new Error(
			'WORKOS_API_HOSTNAME must be a hostname without protocol, path, credentials, or port'
		);
	}

	try {
		const parsed = new URL(`https://${trimmed}`);
		if (!parsed.hostname || parsed.port || parsed.pathname !== '/') {
			throw new Error();
		}

		return parsed.hostname;
	} catch {
		throw new Error(
			'WORKOS_API_HOSTNAME must be a hostname without protocol, path, credentials, or port'
		);
	}
}

function isLocalRedirectUrl(redirectUrl: URL): boolean {
	const hostname =
		redirectUrl.hostname.startsWith('[') && redirectUrl.hostname.endsWith(']')
			? redirectUrl.hostname.slice(1, -1)
			: redirectUrl.hostname;
	return LOCAL_REDIRECT_HOSTS.has(hostname);
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

function getResponseMediaType(contentType: string | null | undefined): string {
	return contentType?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function isDocumentResponse(response: Response): boolean {
	const contentType = getResponseMediaType(
		response.headers.get('Content-Type')
	);
	return (
		contentType.includes('text/html') ||
		contentType.includes('application/xhtml+xml')
	);
}

function isStaticAssetMediaType(mediaType: string): boolean {
	if (!mediaType) {
		return false;
	}

	if (STATIC_ASSET_RESPONSE_CONTENT_TYPES.has(mediaType)) {
		return true;
	}

	return STATIC_ASSET_RESPONSE_CONTENT_TYPE_PREFIXES.some((prefix) =>
		mediaType.startsWith(prefix)
	);
}

function buildTrustedProxyIpSet(
	trustedProxyIps: Iterable<string> | undefined
): Set<string> {
	const trustedProxyIpSet = new Set<string>();
	for (const ip of trustedProxyIps ?? []) {
		const normalized = canonicalizeIpAddress(ip);
		if (!normalized) {
			continue;
		}
		trustedProxyIpSet.add(normalized);
	}
	return trustedProxyIpSet;
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

function isLoopbackIpAddress(ipAddress: string): boolean {
	const canonical = canonicalizeIpAddress(ipAddress);
	return canonical === '127.0.0.1' || canonical === '::1';
}

function isLocalOrigin(origin: string): boolean {
	try {
		return isLocalRedirectUrl(new URL(origin));
	} catch {
		return false;
	}
}

function isTrustedProxyHop(
	event: RequestEvent,
	trustedProxyIps: Set<string>
): boolean {
	if (
		trustedProxyIps.size === 0 ||
		typeof event.getClientAddress !== 'function'
	) {
		return false;
	}

	try {
		return trustedProxyIps.has(canonicalizeIpAddress(event.getClientAddress()));
	} catch {
		return false;
	}
}

function hasAuthorizationHeader(event: RequestEvent): boolean {
	return Boolean(event.request?.headers.get('authorization')?.trim());
}

export function getTrustedForwardedProto(
	value: string | readonly string[] | undefined | null
): string {
	const rawValue = Array.isArray(value) ? value.join(',') : value;
	if (typeof rawValue !== 'string') {
		return '';
	}

	const hops = rawValue
		.split(',')
		.map((segment) => segment.trim().toLowerCase())
		.filter(Boolean);
	if (hops.length === 0) {
		return '';
	}

	const originalClientProto = hops[0];
	if (
		originalClientProto === HTTPS_PROTO ||
		originalClientProto === HTTP_PROTO
	) {
		return originalClientProto;
	}

	return '';
}

function isAuthRouteRequest(event: RequestEvent): boolean {
	const pathname = event.url?.pathname ?? '/';
	return pathname === '/auth' || pathname.startsWith(AUTH_ROUTE_PATH_PREFIX);
}

function isSecureRequest(
	event: RequestEvent,
	trustForwardedProto: boolean,
	trustedProxyIps: Set<string>
): boolean {
	if (trustForwardedProto && isTrustedProxyHop(event, trustedProxyIps)) {
		const forwardedProto = getTrustedForwardedProto(
			event.request?.headers.get(FORWARDED_PROTO_HEADER)
		);
		if (forwardedProto) {
			return forwardedProto === HTTPS_PROTO;
		}
	}

	if (event.url?.protocol === 'https:') {
		return true;
	}

	if (!event.request?.url) {
		return false;
	}

	try {
		return new URL(event.request.url).protocol === 'https:';
	} catch {
		return false;
	}
}

function extractCookieNames(cookieHeader: string | null): string[] {
	if (!cookieHeader) {
		return [];
	}

	return cookieHeader
		.split(';')
		.map((entry: string) => entry.split('=')[0]?.trim().toLowerCase() ?? '')
		.filter(Boolean);
}

function hasSensitiveCookieHeader(event: RequestEvent): boolean {
	const cookieHeader = event.request?.headers.get('cookie') ?? null;
	if (!cookieHeader) {
		return false;
	}

	const cookieNames = extractCookieNames(cookieHeader);
	return cookieNames.some((cookieName) =>
		SENSITIVE_AUTH_COOKIE_NAMES.has(cookieName)
	);
}

function isAuthSensitiveRequest(event: RequestEvent): boolean {
	return isAuthRouteRequest(event) || hasAuthorizationHeader(event);
}

function getVerifiedStaticAssetCacheControl(
	event: RequestEvent,
	response: Response,
	hasSetCookie: boolean
): string | null {
	return getStaticAssetCacheControlForResponse({
		pathname: event.url?.pathname,
		statusCode: response.status,
		contentType: response.headers.get('Content-Type'),
		hasSetCookie
	});
}

function getVaryHeadersForRequest(
	event: RequestEvent,
	response: Response
): string[] {
	const varyHeaders: string[] = [];
	if (
		isAuthRouteRequest(event) ||
		hasSensitiveCookieHeader(event) ||
		responseSetsCookies(response)
	) {
		varyHeaders.push(CACHE_VARY_COOKIE_HEADER);
	}
	if (hasAuthorizationHeader(event) || isAuthRouteRequest(event)) {
		varyHeaders.push(CACHE_VARY_AUTHORIZATION_HEADER);
	}
	return varyHeaders;
}

function responseSetsCookies(response: Response): boolean {
	const getSetCookie = response.headers?.getSetCookie;
	if (typeof getSetCookie === 'function') {
		return getSetCookie.call(response.headers).length > 0;
	}
	return response.headers.has('Set-Cookie');
}

function appendVaryHeaders(headers: Headers, values: string[]): void {
	const existing = headers.get('Vary');
	if (existing === '*') {
		return;
	}

	const merged = new Set(
		(existing ?? '')
			.split(',')
			.map((value: string) => value.trim())
			.filter(Boolean)
	);
	for (const value of values) {
		merged.add(value);
	}

	if (merged.size > 0) {
		headers.set('Vary', [...merged].join(', '));
	}
}

function getDocumentCacheControl(response: Response): string {
	if (response.status < 200 || response.status >= 300) {
		return SENSITIVE_DOCUMENT_CACHE_CONTROL;
	}

	return PUBLIC_DOCUMENT_CACHE_CONTROL;
}

function isImmutableAssetPath(pathname: string | undefined | null): boolean {
	return Boolean(pathname && pathname.startsWith('/_app/immutable/'));
}

function isRootStaticAssetPath(pathname: string | undefined | null): boolean {
	if (!pathname || pathname === '/') {
		return false;
	}
	if (pathname.startsWith('/.well-known/')) {
		return true;
	}
	return ROOT_STATIC_ASSET_PATHS.has(pathname.toLowerCase());
}

function isFontAssetPath(pathname: string | undefined | null): boolean {
	return Boolean(pathname && pathname.startsWith(FONT_ASSET_PATH_PREFIX));
}

export function getStaticAssetCacheControl(
	pathname: string | undefined | null
): string | null {
	if (isImmutableAssetPath(pathname)) {
		return STATIC_IMMUTABLE_CACHE_CONTROL;
	}
	if (isFontAssetPath(pathname)) {
		return STATIC_FONT_ASSET_CACHE_CONTROL;
	}
	if (isRootStaticAssetPath(pathname)) {
		return STATIC_ROOT_ASSET_CACHE_CONTROL;
	}
	return null;
}

export function getStaticAssetCacheControlForResponse({
	pathname,
	statusCode = 200,
	contentType,
	hasSetCookie = false
}: StaticAssetCacheControlOptions): string | null {
	const cacheControl = getStaticAssetCacheControl(pathname);
	if (!cacheControl) {
		return null;
	}
	if (hasSetCookie || statusCode < 200 || statusCode >= 300) {
		return null;
	}

	const mediaType = getResponseMediaType(contentType);
	if (mediaType) {
		return isStaticAssetMediaType(mediaType) ? cacheControl : null;
	}

	return isRootStaticAssetPath(pathname) ? cacheControl : null;
}

export function shouldApplyStaticAssetHeaders(
	pathname: string | undefined | null
): boolean {
	return getStaticAssetCacheControl(pathname) !== null;
}

function isWebHeaders(headers: SecurityHeadersTarget): headers is Headers {
	return headers instanceof Headers;
}

function hasHeader(headers: SecurityHeadersTarget, name: string): boolean {
	if (isWebHeaders(headers)) {
		return headers.has(name);
	}
	return headers.getHeader(name) !== undefined;
}

function setHeader(
	headers: SecurityHeadersTarget,
	name: string,
	value: string
): void {
	if (isWebHeaders(headers)) {
		headers.set(name, value);
		return;
	}
	headers.setHeader(name, value);
}

export function applyBaselineSecurityHeaders(
	headers: SecurityHeadersTarget,
	isSecure: boolean
): void {
	if (isSecure) {
		setHeader(
			headers,
			'Strict-Transport-Security',
			`max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`
		);
	}
	setHeader(headers, 'X-Frame-Options', 'DENY');
	setHeader(headers, 'X-Content-Type-Options', 'nosniff');
	setHeader(headers, 'Referrer-Policy', 'strict-origin-when-cross-origin');
	setHeader(
		headers,
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=()'
	);
}

export function applyStaticAssetHeaders(
	headers: SecurityHeadersTarget,
	pathname: string | undefined | null,
	isSecure: boolean
): void {
	const cacheControl = getStaticAssetCacheControl(pathname);
	if (!cacheControl) {
		return;
	}

	applyBaselineSecurityHeaders(headers, isSecure);
	if (!hasHeader(headers, 'Cache-Control')) {
		setHeader(headers, 'Cache-Control', cacheControl);
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
	const apiHostname = parseWorkosApiHostname(env.WORKOS_API_HOSTNAME);

	if (!HEX_64_PATTERN.test(cookiePassword)) {
		throw new Error(
			'WORKOS_COOKIE_PASSWORD must be 64 hex characters (openssl rand -hex 32)'
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

export function createSecurityHeadersHandle(
	options: SecurityHeadersOptions = {}
): Handle {
	const trustForwardedProto = options.trustForwardedProto === true;
	const trustedProxyIps = buildTrustedProxyIpSet(options.trustedProxyIps);
	return async ({ event, resolve }) => {
		const response = await resolve(event);
		const method = event.request?.method ?? 'GET';
		const hasSetCookie = responseSetsCookies(response);
		const staticCacheControl = response.headers.has('Cache-Control')
			? null
			: getVerifiedStaticAssetCacheControl(event, response, hasSetCookie);

		applyBaselineSecurityHeaders(
			response.headers,
			isSecureRequest(event, trustForwardedProto, trustedProxyIps)
		);

		const isSensitiveResponse =
			isAuthSensitiveRequest(event) ||
			hasSetCookie ||
			(hasSensitiveCookieHeader(event) && staticCacheControl === null);
		if (isSensitiveResponse) {
			response.headers.set('Cache-Control', SENSITIVE_DOCUMENT_CACHE_CONTROL);
			appendVaryHeaders(
				response.headers,
				getVaryHeadersForRequest(event, response)
			);
			return response;
		}

		if (
			(method === 'GET' || method === 'HEAD') &&
			isDocumentResponse(response)
		) {
			if (!response.headers.has('Cache-Control')) {
				response.headers.set(
					'Cache-Control',
					getDocumentCacheControl(response)
				);
			}
			appendVaryHeaders(
				response.headers,
				getVaryHeadersForRequest(event, response)
			);
			return response;
		}

		if (!response.headers.has('Cache-Control')) {
			if (staticCacheControl) {
				response.headers.set('Cache-Control', staticCacheControl);
			}
		}
		return response;
	};
}
