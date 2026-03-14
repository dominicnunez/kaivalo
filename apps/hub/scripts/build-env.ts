import { spawnSync } from 'node:child_process';
import { isIP } from 'node:net';
import { isLoopbackHostname } from '../src/lib/server/ip-address.ts';
import { getValidatedWorkosEnv } from '../src/lib/server/workos-security-env.ts';
import { getHubBuildPaths, removeServerSourceMaps } from './build-artifacts.ts';

const DEFAULT_LOCAL_PREVIEW_PORT = '3100';
const DEFAULT_LOCAL_PREVIEW_HOST = 'localhost';
const LOCAL_PREVIEW_WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '[::]']);
const LOCAL_PLACEHOLDER_ENV_DEFAULTS = {
	WORKOS_CLIENT_ID: 'client_build_placeholder',
	WORKOS_API_KEY: 'sk_build_placeholder',
	WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
	AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32)
} as const;
const BUILD_PLACEHOLDER_FLAG = 'HUB_BUILD_ALLOW_PLACEHOLDERS';

function formatFailedBuildStep(
	command: string,
	args: readonly string[],
	result: Pick<ReturnType<typeof spawnSync>, 'signal' | 'status'>
): string {
	const step = `${command} ${args.join(' ')}`;
	if (typeof result.signal === 'string' && result.signal.length > 0) {
		return `${step} terminated by ${result.signal}`;
	}

	return `${step} exited with code ${result.status ?? 'unknown'}`;
}

function normalizeOriginForReuse(origin: string): string {
	try {
		const parsedOrigin = new URL(origin);
		if (
			parsedOrigin.username ||
			parsedOrigin.password ||
			parsedOrigin.pathname !== '/' ||
			parsedOrigin.search ||
			parsedOrigin.hash
		) {
			return origin;
		}

		return parsedOrigin.origin;
	} catch {
		return origin;
	}
}

function getLocalPreviewOrigin(baseEnv: NodeJS.ProcessEnv): string {
	const configuredOrigin = baseEnv.ORIGIN?.trim();
	if (configuredOrigin) {
		return normalizeOriginForReuse(configuredOrigin);
	}

	const port = baseEnv.PORT?.trim() || DEFAULT_LOCAL_PREVIEW_PORT;
	const host = getLocalPreviewHost(baseEnv);
	return new URL(`http://${host}:${port}`).origin;
}

function getLocalPreviewHost(baseEnv: NodeJS.ProcessEnv): string {
	const configuredHost = baseEnv.HOST?.trim();
	if (!configuredHost) {
		return DEFAULT_LOCAL_PREVIEW_HOST;
	}

	if (
		LOCAL_PREVIEW_WILDCARD_HOSTS.has(configuredHost) ||
		!isLoopbackHostname(configuredHost)
	) {
		throw new Error(
			'ORIGIN must be set when HOST is not a concrete loopback address'
		);
	}

	return formatOriginHost(configuredHost);
}

function formatOriginHost(host: string): string {
	return isIP(host) === 6 && !host.startsWith('[') ? `[${host}]` : host;
}

export function getHubLocalPlaceholderEnv(
	baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
	const origin = getLocalPreviewOrigin(baseEnv);

	return {
		...LOCAL_PLACEHOLDER_ENV_DEFAULTS,
		WORKOS_REDIRECT_URI: `${origin}/auth/callback`,
		ORIGIN: origin
	};
}

function mergePlaceholderEnv(
	baseEnv: NodeJS.ProcessEnv,
	placeholderEnv: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
	return Object.fromEntries(
		Object.entries(placeholderEnv).map(([name, value]) => [
			name,
			name === 'ORIGIN' ? value : (baseEnv[name] ?? value)
		])
	);
}

function shouldAllowBuildPlaceholders(baseEnv: NodeJS.ProcessEnv): boolean {
	const nodeEnv = baseEnv.NODE_ENV?.trim();
	const placeholderFlag = baseEnv[BUILD_PLACEHOLDER_FLAG]?.trim().toLowerCase();

	return (
		nodeEnv === 'test' ||
		placeholderFlag === '1' ||
		placeholderFlag === 'true' ||
		placeholderFlag === 'yes'
	);
}

export function getHubBuildEnv(
	baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
	const buildEnv = shouldAllowBuildPlaceholders(baseEnv)
		? {
				...baseEnv,
				...mergePlaceholderEnv(baseEnv, getHubLocalPlaceholderEnv(baseEnv))
			}
		: { ...baseEnv };

	getValidatedWorkosEnv({
		...buildEnv,
		NODE_ENV: buildEnv.NODE_ENV?.trim() || 'production'
	});

	return {
		...buildEnv,
		[BUILD_PLACEHOLDER_FLAG]: buildEnv[BUILD_PLACEHOLDER_FLAG]
	};
}

export function getHubPreviewEnv(
	baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
	const previewEnv = {
		...baseEnv,
		...mergePlaceholderEnv(baseEnv, getHubLocalPlaceholderEnv(baseEnv)),
		NODE_ENV: baseEnv.NODE_ENV?.trim() || 'production'
	};

	getValidatedWorkosEnv(previewEnv);
	return previewEnv;
}

type RunHubBuildDependencies = {
	baseEnv?: NodeJS.ProcessEnv;
	getBuildPaths?: typeof getHubBuildPaths;
	removeSourceMaps?: typeof removeServerSourceMaps;
	runStep?: typeof spawnSync;
};

export function runHubBuildWithEnv({
	baseEnv = process.env,
	getBuildPaths = getHubBuildPaths,
	removeSourceMaps = removeServerSourceMaps,
	runStep = spawnSync
}: RunHubBuildDependencies = {}): void {
	const steps = [
		['vite', 'build'],
		['node', 'scripts/prepare-runtime.ts']
	] as const;
	const { serverDir } = getBuildPaths();

	for (const [command, ...args] of steps) {
		const result = runStep(command, args, {
			stdio: 'inherit',
			env: getHubBuildEnv(baseEnv)
		});

		if (result.status === 0) {
			if (command === 'vite' && args[0] === 'build') {
				removeSourceMaps(serverDir);
			}
			continue;
		}

		if (result.error) {
			throw result.error;
		}

		throw new Error(formatFailedBuildStep(command, args, result));
	}
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file://').href) {
	runHubBuildWithEnv();
}
