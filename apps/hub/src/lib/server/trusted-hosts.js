const GOOGLE_AVATAR_HOST_PATTERN = /^lh\d+\.googleusercontent\.com$/i;
const TRUSTED_AVATAR_EXACT_HOSTS = [
	'images.workoscdn.com',
	'avatars.githubusercontent.com'
];
const TRUSTED_AVATAR_HOSTNAME_SET = new Set(TRUSTED_AVATAR_EXACT_HOSTS);

export const TRUSTED_AVATAR_CSP_SOURCES = [
	...TRUSTED_AVATAR_EXACT_HOSTS.map((host) => `https://${host}`),
	'https://*.googleusercontent.com'
];

/**
 * @param {string} hostname
 * @returns {boolean}
 */
export function isTrustedAvatarHost(hostname) {
	return (
		TRUSTED_AVATAR_HOSTNAME_SET.has(hostname) ||
		GOOGLE_AVATAR_HOST_PATTERN.test(hostname)
	);
}
