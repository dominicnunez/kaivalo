type WorkosOriginPolicyEnv = {
	origin: string;
	redirectUri: string;
	apiHostname: string;
};

export function getTrustedAuthOriginSet(
	workosEnv: WorkosOriginPolicyEnv
): Set<string> {
	return new Set([
		workosEnv.origin,
		new URL(workosEnv.redirectUri).origin,
		`https://${workosEnv.apiHostname}`
	]);
}

export function getTrustedWorkosAuthOrigin(
	workosEnv: Pick<WorkosOriginPolicyEnv, 'apiHostname'>
): string {
	return `https://${workosEnv.apiHostname}`;
}
