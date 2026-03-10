type WorkosOriginPolicyEnv = {
	authkitHostname: string;
};

export function getTrustedWorkosAuthOrigin(
	workosEnv: WorkosOriginPolicyEnv
): string {
	return `https://${workosEnv.authkitHostname}`;
}
