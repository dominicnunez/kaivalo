import type { IncomingHttpHeaders } from 'node:http';
export {
	HUB_HEALTH_BODY,
	HUB_HEALTH_CACHE_CONTROL,
	HUB_HEALTH_CONTENT_TYPE,
	HUB_HEALTH_PATH,
	HUB_HEALTH_STATUS_CODE
} from '../../src/lib/server/health-contract.ts';
import {
	HUB_HEALTH_BODY,
	HUB_HEALTH_CACHE_CONTROL,
	HUB_HEALTH_CONTENT_TYPE,
	HUB_HEALTH_PATH,
	HUB_HEALTH_STATUS_CODE
} from '../../src/lib/server/health-contract.ts';

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
