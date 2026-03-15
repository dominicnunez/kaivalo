import { isIP } from 'node:net';
import { sanitizeHubRuntimeEnv as sanitizeHubRuntimeEnvBase } from '../../apps/hub/scripts/runtime-env.ts';

export const sanitizeHubRuntimeEnv = sanitizeHubRuntimeEnvBase;

type HubSpawnEnvOptions = {
	baseEnv?: NodeJS.ProcessEnv;
	port: number;
	host?: string;
	nodeEnv: string;
	envOverrides?: Record<string, string | undefined>;
	imports?: readonly string[];
	sanitizeInheritedRuntimeEnv?: boolean;
};

type HubServerEnvOptions = {
	baseEnv?: NodeJS.ProcessEnv;
	port: number;
	envOverrides?: Record<string, string | undefined>;
	imports?: readonly string[];
};

type HubPreviewScriptEnvOptions = HubServerEnvOptions & {
	nodeEnv?: string;
	sanitizeInheritedRuntimeEnv?: boolean;
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

function createHubSpawnEnv({
	baseEnv = process.env,
	port,
	host = '127.0.0.1',
	nodeEnv,
	envOverrides = {},
	imports = [],
	sanitizeInheritedRuntimeEnv = true
}: HubSpawnEnvOptions): NodeJS.ProcessEnv {
	const inheritedEnv = sanitizeInheritedRuntimeEnv
		? sanitizeHubRuntimeEnv(baseEnv)
		: { ...baseEnv };
	const env: NodeJS.ProcessEnv = {
		...inheritedEnv,
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
			AVATAR_PROXY_SIGNING_SECRET: 'ef'.repeat(32),
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
			AVATAR_PROXY_SIGNING_SECRET: 'ef'.repeat(32),
			ORIGIN: origin,
			...envOverrides
		}
	});
}

export function createHubPreviewScriptEnv({
	baseEnv,
	port,
	envOverrides = {},
	imports = [],
	nodeEnv = 'production',
	sanitizeInheritedRuntimeEnv = true
}: HubPreviewScriptEnvOptions): NodeJS.ProcessEnv {
	return createHubSpawnEnv({
		baseEnv,
		port,
		host: '127.0.0.1',
		nodeEnv,
		imports,
		envOverrides,
		sanitizeInheritedRuntimeEnv
	});
}
