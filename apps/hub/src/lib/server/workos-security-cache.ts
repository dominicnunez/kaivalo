import { canonicalizeIpAddress } from './ip-address.ts';
import { SENSITIVE_AUTH_COOKIE_NAMES } from './auth-cookie-names.ts';
import type { Handle, RequestEvent } from '@sveltejs/kit';
import type http from 'node:http';
import { getRequestPeerAddress } from './request-peer-address.ts';

const HSTS_MAX_AGE_SECONDS = 63_072_000;
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
const FORWARDED_PROTO_HEADER = 'x-forwarded-proto';
const HTTPS_PROTO = 'https';
const HTTP_PROTO = 'http';
const CACHE_PRESERVING_REVALIDATION_STATUS = 304;
const ROOT_STATIC_ASSET_PATHS = new Set([
	'/favicon.ico',
	'/favicon.svg',
	'/favicon-192.png',
	'/favicon-512.png',
	'/og-image.png'
]);
const FONT_ASSET_PATH_PREFIX = '/fonts/';
const AUTH_COOKIE_CACHE_PRESERVING_PATHS = new Set(['/avatar']);
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

type HeaderSettingEvent = Pick<RequestEvent, 'setHeaders'>;

function getResponseMediaType(contentType: string | null | undefined): string {
	return contentType?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function setEventHeaders(
	event: HeaderSettingEvent,
	headers: Record<string, string>
): void {
	if (typeof event.setHeaders !== 'function') {
		return;
	}

	event.setHeaders(headers);
}

export function markPrivateNoStoreDocument(
	event: HeaderSettingEvent,
	varyHeaders: readonly string[] = [CACHE_VARY_COOKIE_HEADER]
): void {
	setEventHeaders(event, {
		'cache-control': SENSITIVE_DOCUMENT_CACHE_CONTROL,
		vary: [...new Set(varyHeaders)].join(', ')
	});
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

function isTrustedProxyHop(
	event: RequestEvent,
	trustedProxyIps: Set<string>
): boolean {
	if (trustedProxyIps.size === 0) {
		return false;
	}

	return trustedProxyIps.has(getRequestPeerAddress(event));
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

	const proxyControlledProto = hops[hops.length - 1];
	if (
		proxyControlledProto === HTTPS_PROTO ||
		proxyControlledProto === HTTP_PROTO
	) {
		return proxyControlledProto;
	}

	return '';
}

function isCachePreservingStatus(statusCode: number): boolean {
	return (
		(statusCode >= 200 && statusCode < 300) ||
		statusCode === CACHE_PRESERVING_REVALIDATION_STATUS
	);
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

function shouldIgnoreSensitiveCookies(event: RequestEvent): boolean {
	const method = event.request?.method ?? 'GET';
	if (method !== 'GET' && method !== 'HEAD') {
		return false;
	}

	const pathname = event.url?.pathname ?? '/';
	return AUTH_COOKIE_CACHE_PRESERVING_PATHS.has(pathname);
}

function hasSensitiveCookieHeader(event: RequestEvent): boolean {
	if (shouldIgnoreSensitiveCookies(event)) {
		return false;
	}

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
	if (!isCachePreservingStatus(response.status)) {
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
	if (hasSetCookie || !isCachePreservingStatus(statusCode)) {
		return null;
	}

	const mediaType = getResponseMediaType(contentType);
	if (mediaType) {
		return isStaticAssetMediaType(mediaType) ? cacheControl : null;
	}

	if (statusCode === CACHE_PRESERVING_REVALIDATION_STATUS) {
		return cacheControl;
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

		if (!response.headers.has('Cache-Control') && staticCacheControl) {
			response.headers.set('Cache-Control', staticCacheControl);
		}
		return response;
	};
}
