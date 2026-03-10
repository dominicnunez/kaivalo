import { spawnSync } from 'node:child_process';
import { getValidatedWorkosEnv } from '../src/lib/server/workos-security-env.ts';
import { getHubBuildPaths, removeServerSourceMaps } from './build-artifacts.ts';

const DEFAULT_LOCAL_PREVIEW_PORT = '3100';
const LOCAL_PLACEHOLDER_ENV_DEFAULTS = {
	WORKOS_CLIENT_ID: 'client_build_placeholder',
	WORKOS_API_KEY: 'sk_build_placeholder',
	WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
	AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32)
} as const;
const BUILD_PLACEHOLDER_FLAG = 'HUB_BUILD_ALLOW_PLACEHOLDERS';

function getLocalPreviewOrigin(baseEnv: NodeJS.ProcessEnv): string {
	const configuredOrigin = baseEnv.ORIGIN?.trim();
	if (configuredOrigin) {
		return configuredOrigin;
	}

	const port = baseEnv.PORT?.trim() || DEFAULT_LOCAL_PREVIEW_PORT;
	return `http://localhost:${port}`;
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
				...Object.fromEntries(
					Object.entries(getHubLocalPlaceholderEnv(baseEnv)).map(
						([name, value]) => [name, baseEnv[name] ?? value]
					)
				)
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
		...Object.fromEntries(
			Object.entries(getHubLocalPlaceholderEnv(baseEnv)).map(
				([name, value]) => [name, baseEnv[name] ?? value]
			)
		),
		NODE_ENV: baseEnv.NODE_ENV?.trim() || 'production'
	};

	getValidatedWorkosEnv(previewEnv);
	return previewEnv;
}

export function runHubBuildWithEnv(): void {
	const steps = [
		['vite', 'build'],
		['node', 'scripts/prepare-runtime.ts']
	] as const;
	const { serverDir } = getHubBuildPaths();

	for (const [command, ...args] of steps) {
		const result = spawnSync(command, args, {
			stdio: 'inherit',
			env: getHubBuildEnv()
		});

		if (result.status === 0) {
			if (command === 'vite' && args[0] === 'build') {
				removeServerSourceMaps(serverDir);
			}
			continue;
		}

		if (result.error) {
			throw result.error;
		}

		throw new Error(
			`${command} ${args.join(' ')} exited with code ${result.status ?? 'unknown'}`
		);
	}
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file://').href) {
	runHubBuildWithEnv();
}
