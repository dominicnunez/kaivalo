import { isIP } from 'node:net';

export function canonicalizeIpAddress(
	value: string | undefined | null
): string {
	let candidate = value?.trim().toLowerCase() ?? '';
	if (!candidate) {
		return '';
	}

	if (candidate.startsWith('[') && candidate.endsWith(']')) {
		candidate = candidate.slice(1, -1);
	}

	const zoneIdSeparator = candidate.indexOf('%');
	if (zoneIdSeparator > 0) {
		candidate = candidate.slice(0, zoneIdSeparator);
	}

	if (candidate.startsWith('::ffff:') && candidate.includes('.')) {
		const mappedIpv4 = candidate.slice('::ffff:'.length);
		if (isIP(mappedIpv4) === 4) {
			return mappedIpv4;
		}
	}

	const version = isIP(candidate);
	if (version === 4) {
		return candidate;
	}
	if (version === 6) {
		try {
			const hostname = new URL(`http://[${candidate}]/`).hostname;
			if (hostname.startsWith('[') && hostname.endsWith(']')) {
				return hostname.slice(1, -1);
			}
		} catch {
			// Fall back to normalized lowercase input.
		}
		return candidate;
	}

	return '';
}
