import { canonicalizeIpAddress } from './ip-address.ts';

type TrustedClientAddressOptions = {
	directClientAddress: string | undefined | null;
	forwardedForHeader: string | undefined | null;
	trustedProxyIps?: Iterable<string>;
};

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

function parseForwardedForHeader(
	forwardedForHeader: string | undefined | null
): string[] {
	if (typeof forwardedForHeader !== 'string') {
		return [];
	}

	const forwardedHops = forwardedForHeader
		.split(',')
		.map((hop) => canonicalizeIpAddress(hop))
		.filter(Boolean);

	if (forwardedHops.length === 0) {
		return [];
	}

	const rawHopCount = forwardedForHeader
		.split(',')
		.map((hop) => hop.trim())
		.filter(Boolean).length;

	return forwardedHops.length === rawHopCount ? forwardedHops : [];
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
