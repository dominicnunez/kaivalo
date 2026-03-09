const GOOGLE_AVATAR_HOST_PATTERN = /^lh\d+\.googleusercontent\.com$/i;
const TRUSTED_AVATAR_EXACT_HOSTS = [
	'images.workoscdn.com',
	'avatars.githubusercontent.com'
];
const TRUSTED_AVATAR_HOSTNAME_SET = new Set(TRUSTED_AVATAR_EXACT_HOSTS);

export function isTrustedAvatarHost(hostname: string): boolean {
	return (
		TRUSTED_AVATAR_HOSTNAME_SET.has(hostname) ||
		GOOGLE_AVATAR_HOST_PATTERN.test(hostname)
	);
}
