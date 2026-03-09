type WorkosOriginPolicyEnv = {
	apiHostname: string;
};

export function getTrustedWorkosAuthOrigin(
	workosEnv: WorkosOriginPolicyEnv
): string {
	return `https://${workosEnv.apiHostname}`;
}
