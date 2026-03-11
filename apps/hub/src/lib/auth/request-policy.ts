const BROWSER_NAVIGATION_ACCEPT_HEADER = 'text/html';
const BROWSER_NAVIGATION_FETCH_DESTINATION = 'document';
const BROWSER_NAVIGATION_FETCH_MODE = 'navigate';

export function normalizeConfiguredOrigin(
	value: string,
	fieldName = 'expectedOrigin'
): string {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error(`${fieldName} must be a valid URL origin`);
	}

	if (
		parsed.username ||
		parsed.password ||
		parsed.pathname !== '/' ||
		parsed.search ||
		parsed.hash
	) {
		throw new Error(`${fieldName} must be a valid URL origin`);
	}

	return parsed.origin;
}

export function isBrowserNavigationRequest(
	request: Pick<Request, 'headers'>
): boolean {
	const mode = request.headers.get('sec-fetch-mode')?.toLowerCase();
	const destination = request.headers.get('sec-fetch-dest')?.toLowerCase();
	if (
		mode === BROWSER_NAVIGATION_FETCH_MODE ||
		destination === BROWSER_NAVIGATION_FETCH_DESTINATION
	) {
		return true;
	}

	const accept = request.headers.get('accept')?.toLowerCase() ?? '';
	return (
		accept.includes(BROWSER_NAVIGATION_ACCEPT_HEADER) &&
		!accept.includes('application/json')
	);
}

export function getBrowserNavigationProbeHeaders(): Record<string, string> {
	return {
		accept: BROWSER_NAVIGATION_ACCEPT_HEADER,
		'sec-fetch-mode': BROWSER_NAVIGATION_FETCH_MODE
	};
}
