import { parseCanonicalHostname } from '../hostname.ts';

type WorkosOriginPolicyEnv = {
	apiHostname?: string;
};

export const DEFAULT_WORKOS_API_HOSTNAME = 'api.workos.com';
export const WORKOS_API_HOSTNAME_ERROR_MESSAGE =
	'WORKOS_API_HOSTNAME must be a hostname without protocol, path, credentials, or port';

export function normalizeWorkosApiHostname(
	apiHostname: string | undefined
): string {
	const normalizedHostname = apiHostname?.trim();
	if (!normalizedHostname) {
		return DEFAULT_WORKOS_API_HOSTNAME;
	}

	const canonicalHostname = parseCanonicalHostname(normalizedHostname);
	if (!canonicalHostname) {
		throw new Error(WORKOS_API_HOSTNAME_ERROR_MESSAGE);
	}

	return canonicalHostname;
}

export function getTrustedWorkosAuthOrigin(
	workosEnv: WorkosOriginPolicyEnv
): string {
	return `https://${normalizeWorkosApiHostname(workosEnv.apiHostname)}`;
}
