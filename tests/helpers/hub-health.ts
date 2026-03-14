import type { IncomingHttpHeaders } from 'node:http';

export const HUB_HEALTH_PATH = '/healthz';
export const HUB_HEALTH_STATUS_CODE = 200;
export const HUB_HEALTH_BODY = 'ok';
export const HUB_HEALTH_CACHE_CONTROL = 'no-store';
export const HUB_HEALTH_CONTENT_TYPE = 'text/plain; charset=utf-8';

type HeaderValue = string | number | readonly string[] | undefined;
type HeaderCollection =
	| Headers
	| IncomingHttpHeaders
	| Record<string, HeaderValue>;

type HubHealthResponse = {
	statusCode?: number | null;
	data?: string;
	headers?: HeaderCollection;
};

function normalizeHeaderValue(value: HeaderValue | null): string | null {
	if (Array.isArray(value)) {
		return value.join(', ');
	}
	if (value === null || value === undefined) {
		return null;
	}
	return String(value);
}

function getHeaderValue(
	headers: HeaderCollection | undefined,
	headerName: string
): string | null {
	if (!headers) {
		return null;
	}

	if (headers instanceof Headers) {
		return headers.get(headerName);
	}

	const normalizedHeaderName = headerName.toLowerCase();
	for (const [name, value] of Object.entries(headers)) {
		if (name.toLowerCase() === normalizedHeaderName) {
			return normalizeHeaderValue(value);
		}
	}

	return null;
}

export function getHubHealthUrl(baseUrl: string): string {
	return new URL(HUB_HEALTH_PATH, baseUrl).toString();
}

export function getHubHealthResponseViolations(
	response: HubHealthResponse
): string[] {
	const violations: string[] = [];
	if (response.statusCode !== HUB_HEALTH_STATUS_CODE) {
		violations.push(
			`expected status ${HUB_HEALTH_STATUS_CODE}, received ${response.statusCode ?? 'missing'}`
		);
	}
	if (response.data !== HUB_HEALTH_BODY) {
		violations.push(
			`expected body ${JSON.stringify(HUB_HEALTH_BODY)}, received ${JSON.stringify(response.data ?? '')}`
		);
	}

	const cacheControl = getHeaderValue(response.headers, 'cache-control');
	if (cacheControl !== HUB_HEALTH_CACHE_CONTROL) {
		violations.push(
			`expected cache-control ${JSON.stringify(HUB_HEALTH_CACHE_CONTROL)}, received ${JSON.stringify(cacheControl)}`
		);
	}

	const contentType = getHeaderValue(response.headers, 'content-type');
	if (contentType !== HUB_HEALTH_CONTENT_TYPE) {
		violations.push(
			`expected content-type ${JSON.stringify(HUB_HEALTH_CONTENT_TYPE)}, received ${JSON.stringify(contentType)}`
		);
	}

	return violations;
}

export function isHubHealthResponse(response: HubHealthResponse): boolean {
	return getHubHealthResponseViolations(response).length === 0;
}
