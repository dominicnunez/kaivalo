const MAX_HOSTNAME_LENGTH = 253;
const HOSTNAME_LABEL_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i;

export function isValidHostname(hostname: string): boolean {
	if (
		hostname.length === 0 ||
		hostname.length > MAX_HOSTNAME_LENGTH ||
		hostname.startsWith('.') ||
		hostname.endsWith('.') ||
		hostname.includes('..')
	) {
		return false;
	}

	return hostname
		.split('.')
		.every((label) => HOSTNAME_LABEL_PATTERN.test(label));
}

export function parseCanonicalHostname(value: string): string | null {
	if (value.includes(':')) {
		return null;
	}

	try {
		const parsed = new URL(`https://${value}`);
		if (!parsed.hostname || parsed.port || parsed.pathname !== '/') {
			return null;
		}

		return isValidHostname(parsed.hostname) ? parsed.hostname : null;
	} catch {
		return null;
	}
}
