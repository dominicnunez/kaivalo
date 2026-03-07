import { canonicalizeIpAddress } from './ip-address.js';

const REQUIRED_ENV_VARS = [
	'WORKOS_CLIENT_ID',
	'WORKOS_API_KEY',
	'WORKOS_REDIRECT_URI',
	'WORKOS_COOKIE_PASSWORD'
];
const HEX_64_PATTERN = /^[a-f0-9]{64}$/i;
const HSTS_MAX_AGE_SECONDS = 63_072_000;
const LOCAL_REDIRECT_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
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
const SENSITIVE_COOKIE_NAMES = new Set([
	'wos-session',
	'__secure-wos-session',
	'__host-wos-session'
]);
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

/**
 * @param {string} value
 * @returns {URL}
 */
function parseRedirectUrl(value) {
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

/**
 * @param {string} value
 * @returns {URL}
 */
function parseOriginUrl(value) {
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

/**
 * @param {URL} url
 * @param {string} envVarName
 */
function assertHttpOrHttpsProtocol(url, envVarName) {
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(`${envVarName} must use http or https`);
	}
}

/**
 * @param {URL} redirectUrl
 * @returns {boolean}
 */
function isLocalRedirectUrl(redirectUrl) {
	const hostname =
		redirectUrl.hostname.startsWith('[') && redirectUrl.hostname.endsWith(']')
			? redirectUrl.hostname.slice(1, -1)
			: redirectUrl.hostname;
	return LOCAL_REDIRECT_HOSTS.has(hostname);
}

/**
 * @param {URL} url
 * @returns {string}
 */
function getEffectivePort(url) {
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

/**
 * @param {URL} left
 * @param {URL} right
 * @returns {boolean}
 */
function hasEquivalentOrigin(left, right) {
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

/**
 * @param {string | undefined} nodeEnv
 * @returns {boolean}
 */
function isTestEnvironment(nodeEnv) {
	return nodeEnv?.trim() === 'test';
}

/**
 * @param {string | null | undefined} contentType
 * @returns {string}
 */
function getResponseMediaType(contentType) {
	return contentType?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

/**
 * @param {Response} response
 * @returns {boolean}
 */
function isDocumentResponse(response) {
	const contentType = getResponseMediaType(
		response.headers.get('Content-Type')
	);
	return (
		contentType.includes('text/html') ||
		contentType.includes('application/xhtml+xml')
	);
}

/**
 * @param {string} mediaType
 * @returns {boolean}
 */
function isStaticAssetMediaType(mediaType) {
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

/**
 * @param {Iterable<string> | undefined} trustedProxyIps
 * @returns {Set<string>}
 */
function buildTrustedProxyIpSet(trustedProxyIps) {
	const trustedProxyIpSet = new Set();
	for (const ip of trustedProxyIps ?? []) {
		const normalized = canonicalizeIpAddress(ip);
		if (!normalized) {
			continue;
		}
		trustedProxyIpSet.add(normalized);
	}
	return trustedProxyIpSet;
}

/**
 * @param {string | undefined} trustedProxyIpsValue
 * @returns {string[]}
 */
function parseTrustedProxyIps(trustedProxyIpsValue) {
	const entries =
		trustedProxyIpsValue
			?.split(',')
			.map((value) => value.trim())
			.filter((value) => value.length > 0) ?? [];

	return entries.map((entry) => {
		const canonical = canonicalizeIpAddress(entry);
		if (!canonical) {
			throw new Error(
				`TRUSTED_PROXY_IPS contains invalid IP address: ${entry}`
			);
		}
		return canonical;
	});
}

/**
 * @param {string} ipAddress
 * @returns {boolean}
 */
function isLoopbackIpAddress(ipAddress) {
	const canonical = canonicalizeIpAddress(ipAddress);
	return canonical === '127.0.0.1' || canonical === '::1';
}

/**
 * @param {string} origin
 * @returns {boolean}
 */
function isLocalOrigin(origin) {
	try {
		return isLocalRedirectUrl(new URL(origin));
	} catch {
		return false;
	}
}

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {Set<string>} trustedProxyIps
 * @returns {boolean}
 */
function isTrustedProxyHop(event, trustedProxyIps) {
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

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {boolean}
 */
function hasAuthorizationHeader(event) {
	return Boolean(event.request?.headers.get('authorization')?.trim());
}

/**
 * @param {string | string[] | undefined | null} value
 * @returns {string}
 */
export function getTrustedForwardedProto(value) {
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

	const trustedHop = hops[hops.length - 1];
	if (trustedHop === HTTPS_PROTO || trustedHop === HTTP_PROTO) {
		return trustedHop;
	}

	return '';
}

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {boolean}
 */
function isAuthRouteRequest(event) {
	const pathname = event.url?.pathname ?? '/';
	return pathname === '/auth' || pathname.startsWith(AUTH_ROUTE_PATH_PREFIX);
}

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {boolean} trustForwardedProto
 * @param {Set<string>} trustedProxyIps
 * @returns {boolean}
 */
function isSecureRequest(event, trustForwardedProto, trustedProxyIps) {
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

/**
 * @param {string | null} cookieHeader
 * @returns {string[]}
 */
function extractCookieNames(cookieHeader) {
	if (!cookieHeader) {
		return [];
	}

	return cookieHeader
		.split(';')
		.map((entry) => entry.split('=')[0]?.trim().toLowerCase() ?? '')
		.filter(Boolean);
}

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {boolean}
 */
function hasSensitiveCookieHeader(event) {
	const cookieHeader = event.request?.headers.get('cookie') ?? null;
	if (!cookieHeader) {
		return false;
	}

	const cookieNames = extractCookieNames(cookieHeader);
	return cookieNames.some((cookieName) =>
		SENSITIVE_COOKIE_NAMES.has(cookieName)
	);
}

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {boolean}
 */
function isSensitiveRequest(event) {
	return (
		isAuthRouteRequest(event) ||
		hasSensitiveCookieHeader(event) ||
		hasAuthorizationHeader(event)
	);
}

/**
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {Response} response
 * @returns {string[]}
 */
function getVaryHeadersForRequest(event, response) {
	const varyHeaders = [];
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

/**
 * @param {Response} response
 * @returns {boolean}
 */
function responseSetsCookies(response) {
	const getSetCookie = response.headers?.getSetCookie;
	if (typeof getSetCookie === 'function') {
		return getSetCookie.call(response.headers).length > 0;
	}
	return response.headers.has('Set-Cookie');
}

/**
 * @param {Headers} headers
 * @param {string[]} values
 */
function appendVaryHeaders(headers, values) {
	const existing = headers.get('Vary');
	if (existing === '*') {
		return;
	}

	const merged = new Set(
		(existing ?? '')
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean)
	);
	for (const value of values) {
		merged.add(value);
	}

	if (merged.size > 0) {
		headers.set('Vary', [...merged].join(', '));
	}
}

/**
 * @param {Response} response
 * @returns {string}
 */
function getDocumentCacheControl(response) {
	if (response.status < 200 || response.status >= 300) {
		return SENSITIVE_DOCUMENT_CACHE_CONTROL;
	}

	return PUBLIC_DOCUMENT_CACHE_CONTROL;
}

/**
 * @param {string | undefined | null} pathname
 * @returns {boolean}
 */
function isImmutableAssetPath(pathname) {
	return Boolean(pathname && pathname.startsWith('/_app/immutable/'));
}

/**
 * @param {string | undefined | null} pathname
 * @returns {boolean}
 */
function isRootStaticAssetPath(pathname) {
	if (!pathname || pathname === '/') {
		return false;
	}
	if (pathname.startsWith('/.well-known/')) {
		return true;
	}
	return ROOT_STATIC_ASSET_PATHS.has(pathname.toLowerCase());
}

/**
 * @param {string | undefined | null} pathname
 * @returns {boolean}
 */
function isFontAssetPath(pathname) {
	return Boolean(pathname && pathname.startsWith(FONT_ASSET_PATH_PREFIX));
}

/**
 * @param {string | undefined | null} pathname
 * @returns {string | null}
 */
export function getStaticAssetCacheControl(pathname) {
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

/**
 * @param {{
 *   pathname: string | undefined | null
 *   statusCode?: number | undefined
 *   contentType?: string | null | undefined
 *   hasSetCookie?: boolean | undefined
 * }} options
 * @returns {string | null}
 */
export function getStaticAssetCacheControlForResponse({
	pathname,
	statusCode = 200,
	contentType,
	hasSetCookie = false
}) {
	const cacheControl = getStaticAssetCacheControl(pathname);
	if (!cacheControl) {
		return null;
	}
	if (hasSetCookie || statusCode < 200 || statusCode >= 300) {
		return null;
	}

	return isStaticAssetMediaType(getResponseMediaType(contentType))
		? cacheControl
		: null;
}

/**
 * @param {string | undefined | null} pathname
 * @returns {boolean}
 */
export function shouldApplyStaticAssetHeaders(pathname) {
	return getStaticAssetCacheControl(pathname) !== null;
}

/**
 * @param {Headers | import('node:http').ServerResponse} headers
 * @returns {headers is Headers}
 */
function isWebHeaders(headers) {
	return headers instanceof Headers;
}

/**
 * @param {Headers | import('node:http').ServerResponse} headers
 * @param {string} name
 * @returns {boolean}
 */
function hasHeader(headers, name) {
	if (isWebHeaders(headers)) {
		return headers.has(name);
	}
	return headers.getHeader(name) !== undefined;
}

/**
 * @param {Headers | import('node:http').ServerResponse} headers
 * @param {string} name
 * @param {string} value
 */
function setHeader(headers, name, value) {
	if (isWebHeaders(headers)) {
		headers.set(name, value);
		return;
	}
	headers.setHeader(name, value);
}

/**
 * @param {Headers | import('node:http').ServerResponse} headers
 * @param {boolean} isSecure
 */
export function applyBaselineSecurityHeaders(headers, isSecure) {
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

/**
 * @param {Headers | import('node:http').ServerResponse} headers
 * @param {string | undefined | null} pathname
 * @param {boolean} isSecure
 */
export function applyStaticAssetHeaders(headers, pathname, isSecure) {
	const cacheControl = getStaticAssetCacheControl(pathname);
	if (!cacheControl) {
		return;
	}

	applyBaselineSecurityHeaders(headers, isSecure);
	if (!hasHeader(headers, 'Cache-Control')) {
		setHeader(headers, 'Cache-Control', cacheControl);
	}
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 * @returns {string}
 */
function readRequiredTrimmedEnvValue(env, name) {
	const value = env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{
 * clientId: string
 * apiKey: string
 * redirectUri: string
 * cookiePassword: string
 * origin: string
 * }}
 */
export function getValidatedWorkosEnv(env) {
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
			origin: localOrigin
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
		origin: originUrl.origin
	};
}

/**
 * @param {Record<string, string | undefined>} env
 */
export function assertValidWorkosEnv(env) {
	getValidatedWorkosEnv(env);
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} origin
 * @returns {{
 * trustForwardedProto: boolean
 * trustedProxyIps: string[]
 * }}
 */
export function getProxyTrustConfiguration(env, origin) {
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
			trustedProxyIps.every((ipAddress) => isLoopbackIpAddress(ipAddress));
		if (hasOnlyLoopbackTrustedProxies) {
			throw new Error(LOOPBACK_PROXY_TRUST_ERROR_MESSAGE);
		}
	}

	return { trustForwardedProto, trustedProxyIps };
}

/**
 * @typedef {object} SecurityHeadersOptions
 * @property {boolean} [trustForwardedProto]
 * @property {Iterable<string>} [trustedProxyIps]
 */

/**
 * @param {SecurityHeadersOptions} [options]
 * @returns {import('@sveltejs/kit').Handle}
 */
export function createSecurityHeadersHandle(options = {}) {
	const trustForwardedProto = options.trustForwardedProto === true;
	const trustedProxyIps = buildTrustedProxyIpSet(options.trustedProxyIps);
	return async ({ event, resolve }) => {
		const response = await resolve(event);
		const method = event.request?.method ?? 'GET';

		applyBaselineSecurityHeaders(
			response.headers,
			isSecureRequest(event, trustForwardedProto, trustedProxyIps)
		);

		const isSensitiveResponse =
			isSensitiveRequest(event) || responseSetsCookies(response);
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
			const staticCacheControl = getStaticAssetCacheControlForResponse({
				pathname: event.url?.pathname,
				statusCode: response.status,
				contentType: response.headers.get('Content-Type'),
				hasSetCookie: responseSetsCookies(response)
			});
			if (staticCacheControl) {
				response.headers.set('Cache-Control', staticCacheControl);
			}
		}
		return response;
	};
}
