const HUB_RUNTIME_ENV_NAMES = [
	'ADDRESS_HEADER',
	'AUTH_ERROR_SIGNING_SECRET',
	'DEV_AUTH_BYPASS',
	'DEV_AUTH_BYPASS_EMAIL',
	'DEV_AUTH_BYPASS_FIRST_NAME',
	'HOST',
	'HUB_PREVIEW_AVATAR_FIXTURE_MODE',
	'HUB_PREVIEW_CALLBACK_FIXTURE_MODE',
	'HUB_PREVIEW_SIGN_IN_FIXTURE_MODE',
	'HUB_PREVIEW_SIGN_OUT_FIXTURE_MODE',
	'NODE_ENV',
	'NODE_OPTIONS',
	'ORIGIN',
	'PORT',
	'SHUTDOWN_TIMEOUT_MS',
	'TRUSTED_PROXY_IPS',
	'TRUST_X_FORWARDED_PROTO',
	'WORKOS_API_HOSTNAME',
	'WORKOS_API_KEY',
	'WORKOS_CLIENT_ID',
	'WORKOS_COOKIE_PASSWORD',
	'WORKOS_REDIRECT_URI',
	'XFF_DEPTH'
] as const;
const HUB_PREVIEW_INPUT_ENV_NAMES = [
	'AUTH_ERROR_SIGNING_SECRET',
	'DEV_AUTH_BYPASS',
	'DEV_AUTH_BYPASS_EMAIL',
	'DEV_AUTH_BYPASS_FIRST_NAME',
	'HOST',
	'HUB_PREVIEW_AVATAR_FIXTURE_MODE',
	'HUB_PREVIEW_CALLBACK_FIXTURE_MODE',
	'HUB_PREVIEW_SIGN_IN_FIXTURE_MODE',
	'HUB_PREVIEW_SIGN_OUT_FIXTURE_MODE',
	'NODE_ENV',
	'ORIGIN',
	'PORT',
	'WORKOS_API_HOSTNAME',
	'WORKOS_API_KEY',
	'WORKOS_CLIENT_ID',
	'WORKOS_COOKIE_PASSWORD',
	'WORKOS_REDIRECT_URI'
] as const;

export function sanitizeHubRuntimeEnv(
	baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
	const sanitizedEnv = { ...baseEnv };
	for (const envName of HUB_RUNTIME_ENV_NAMES) {
		delete sanitizedEnv[envName];
	}

	return sanitizedEnv;
}

export function applyHubRuntimeEnv(
	targetEnv: NodeJS.ProcessEnv,
	nextEnv: NodeJS.ProcessEnv
): void {
	for (const envName of HUB_RUNTIME_ENV_NAMES) {
		delete targetEnv[envName];
	}

	for (const [envName, value] of Object.entries(nextEnv)) {
		if (value === undefined) {
			delete targetEnv[envName];
			continue;
		}

		targetEnv[envName] = value;
	}
}

export function getHubPreviewBaseEnv(
	baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
	const previewBaseEnv: NodeJS.ProcessEnv = {};
	for (const envName of HUB_PREVIEW_INPUT_ENV_NAMES) {
		const value = baseEnv[envName];
		if (value !== undefined) {
			previewBaseEnv[envName] = value;
		}
	}

	return previewBaseEnv;
}
