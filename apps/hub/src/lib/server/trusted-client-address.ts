import { canonicalizeIpAddress } from './ip-address.ts';

type TrustedClientAddressOptions = {
	directClientAddress: string | undefined | null;
	forwardedForHeader: string | undefined | null;
	trustedProxyIps?: Iterable<string>;
};

const MAX_PORT_NUMBER = 65_535;

function buildTrustedProxySet(trustedProxyIps: Iterable<string>): Set<string> {
	const trustedProxySet = new Set<string>();

	for (const trustedProxyIp of trustedProxyIps) {
		const normalizedTrustedProxyIp = canonicalizeIpAddress(trustedProxyIp);
		if (!normalizedTrustedProxyIp) {
			continue;
		}

		trustedProxySet.add(normalizedTrustedProxyIp);
	}

	return trustedProxySet;
}

function isValidForwardedHopPort(candidatePort: string): boolean {
	if (!/^\d+$/.test(candidatePort)) {
		return false;
	}

	const parsedPort = Number.parseInt(candidatePort, 10);
	return parsedPort >= 0 && parsedPort <= MAX_PORT_NUMBER;
}

function normalizeForwardedForHop(hop: string): string {
	const trimmedHop = hop.trim();
	if (!trimmedHop) {
		return '';
	}

	if (trimmedHop.startsWith('[')) {
		const bracketEndIndex = trimmedHop.indexOf(']');
		if (bracketEndIndex < 0) {
			return '';
		}

		const candidateAddress = trimmedHop.slice(0, bracketEndIndex + 1);
		const remainder = trimmedHop.slice(bracketEndIndex + 1);
		if (remainder && !/^:\d+$/.test(remainder)) {
			return '';
		}
		if (remainder && !isValidForwardedHopPort(remainder.slice(1))) {
			return '';
		}

		return canonicalizeIpAddress(candidateAddress);
	}

	const lastColonIndex = trimmedHop.lastIndexOf(':');
	if (lastColonIndex > 0 && trimmedHop.includes('.')) {
		const candidateAddress = trimmedHop.slice(0, lastColonIndex);
		const candidatePort = trimmedHop.slice(lastColonIndex + 1);
		if (isValidForwardedHopPort(candidatePort)) {
			const normalizedAddress = canonicalizeIpAddress(candidateAddress);
			if (normalizedAddress) {
				return normalizedAddress;
			}
		}
	}

	return canonicalizeIpAddress(trimmedHop);
}

function parseForwardedForHeader(
	forwardedForHeader: string | undefined | null
): string[] {
	if (typeof forwardedForHeader !== 'string') {
		return [];
	}

	const rawForwardedHops = forwardedForHeader
		.split(',')
		.map((hop) => hop.trim())
		.filter(Boolean);
	const forwardedHops = rawForwardedHops
		.map((hop) => normalizeForwardedForHop(hop))
		.filter(Boolean);

	if (forwardedHops.length === 0) {
		return [];
	}

	return forwardedHops.length === rawForwardedHops.length ? forwardedHops : [];
}

export function getTrustedClientAddress({
	directClientAddress,
	forwardedForHeader,
	trustedProxyIps = []
}: TrustedClientAddressOptions): string {
	const normalizedDirectClientAddress =
		canonicalizeIpAddress(directClientAddress);
	if (!normalizedDirectClientAddress) {
		return '';
	}

	const trustedProxySet = buildTrustedProxySet(trustedProxyIps);
	if (!trustedProxySet.has(normalizedDirectClientAddress)) {
		return normalizedDirectClientAddress;
	}

	const forwardedHops = parseForwardedForHeader(forwardedForHeader);
	if (forwardedHops.length === 0) {
		return '';
	}

	const proxyChain = [...forwardedHops, normalizedDirectClientAddress];
	let candidateIndex = proxyChain.length - 1;

	while (
		candidateIndex >= 0 &&
		trustedProxySet.has(proxyChain[candidateIndex] ?? '')
	) {
		candidateIndex -= 1;
	}

	return candidateIndex >= 0 ? (proxyChain[candidateIndex] ?? '') : '';
}
