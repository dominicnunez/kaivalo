/**
 * @param {{ origin: string; redirectUri: string; apiHostname: string }} workosEnv
 * @returns {Set<string>}
 */
export function getTrustedAuthOriginSet(workosEnv) {
	return new Set([
		workosEnv.origin,
		new URL(workosEnv.redirectUri).origin,
		`https://${workosEnv.apiHostname}`
	]);
}

/**
 * @param {{ apiHostname: string }} workosEnv
 * @returns {string}
 */
export function getTrustedWorkosAuthOrigin(workosEnv) {
	return `https://${workosEnv.apiHostname}`;
}
