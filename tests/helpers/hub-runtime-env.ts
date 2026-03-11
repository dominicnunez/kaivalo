import { isIP } from 'node:net';

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
	'WORKOS_AUTHKIT_HOSTNAME',
	'WORKOS_CLIENT_ID',
	'WORKOS_COOKIE_PASSWORD',
	'WORKOS_REDIRECT_URI',
	'XFF_DEPTH'
] as const;

type HubSpawnEnvOptions = {
	baseEnv?: NodeJS.ProcessEnv;
	port: number;
	host?: string;
	nodeEnv: string;
	envOverrides?: Record<string, string | undefined>;
	imports?: readonly string[];
};

type HubServerEnvOptions = {
	baseEnv?: NodeJS.ProcessEnv;
	port: number;
	envOverrides?: Record<string, string | undefined>;
	imports?: readonly string[];
};

function formatOriginHost(host: string): string {
	return isIP(host) === 6 && !host.startsWith('[') ? `[${host}]` : host;
}

function buildNodeOptions(
	explicitNodeOptions: string | undefined,
	imports: readonly string[]
): string | undefined {
	const importOptions = imports.map(
		(moduleSpecifier) => `--import=${moduleSpecifier}`
	);
	const nodeOptions = [explicitNodeOptions, ...importOptions]
		.filter(
			(value): value is string => typeof value === 'string' && value !== ''
		)
		.join(' ')
		.trim();

	return nodeOptions === '' ? undefined : nodeOptions;
}

function stripUndefinedEnvValues(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	for (const [name, value] of Object.entries(env)) {
		if (value === undefined) {
			delete env[name];
		}
	}

	return env;
}

export function sanitizeHubRuntimeEnv(
	baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
	const sanitizedEnv = { ...baseEnv };
	for (const envName of HUB_RUNTIME_ENV_NAMES) {
		delete sanitizedEnv[envName];
	}

	return sanitizedEnv;
}

function createHubSpawnEnv({
	baseEnv = process.env,
	port,
	host = '127.0.0.1',
	nodeEnv,
	envOverrides = {},
	imports = []
}: HubSpawnEnvOptions): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {
		...sanitizeHubRuntimeEnv(baseEnv),
		...envOverrides,
		HOST: host,
		PORT: String(port),
		NODE_ENV: nodeEnv
	};

	const nodeOptions = buildNodeOptions(envOverrides.NODE_OPTIONS, imports);
	if (nodeOptions) {
		env.NODE_OPTIONS = nodeOptions;
	} else {
		delete env.NODE_OPTIONS;
	}

	return stripUndefinedEnvValues(env);
}

export function createHubPreviewEnv({
	baseEnv,
	port,
	envOverrides = {},
	imports = []
}: HubServerEnvOptions): NodeJS.ProcessEnv {
	const host = envOverrides.HOST ?? '127.0.0.1';
	const origin =
		envOverrides.ORIGIN ?? `http://${formatOriginHost(host)}:${port}`;

	return createHubSpawnEnv({
		baseEnv,
		port,
		host,
		nodeEnv: 'test',
		imports,
		envOverrides: {
			WORKOS_CLIENT_ID: 'client_test_fixture',
			WORKOS_API_KEY: 'sk_test_fixture',
			WORKOS_REDIRECT_URI: `${origin}/auth/callback`,
			WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
			AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
			ORIGIN: origin,
			...envOverrides
		}
	});
}

export function createHubBuiltRuntimeEnv({
	baseEnv,
	port,
	envOverrides = {},
	imports = []
}: HubServerEnvOptions): NodeJS.ProcessEnv {
	const origin = envOverrides.ORIGIN ?? `http://127.0.0.1:${port}`;

	return createHubSpawnEnv({
		baseEnv,
		port,
		host: '127.0.0.1',
		nodeEnv: 'production',
		imports,
		envOverrides: {
			WORKOS_CLIENT_ID: 'client_test_fixture',
			WORKOS_API_KEY: 'sk_test_fixture',
			WORKOS_REDIRECT_URI: `${origin}/auth/callback`,
			WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
			AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
			ORIGIN: origin,
			...envOverrides
		}
	});
}

export function createHubPreviewScriptEnv({
	baseEnv,
	port,
	envOverrides = {},
	imports = []
}: HubServerEnvOptions): NodeJS.ProcessEnv {
	return createHubSpawnEnv({
		baseEnv,
		port,
		host: '127.0.0.1',
		nodeEnv: 'production',
		imports,
		envOverrides
	});
}
