import { spawnSync } from 'node:child_process';
import { getValidatedWorkosEnv } from '../src/lib/server/workos-security-env.ts';
import { getHubBuildPaths, removeServerSourceMaps } from './build-artifacts.ts';

const BUILD_ENV_DEFAULTS = {
	WORKOS_CLIENT_ID: 'client_build_placeholder',
	WORKOS_API_KEY: 'sk_build_placeholder',
	WORKOS_REDIRECT_URI: 'http://localhost:3100/auth/callback',
	WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
	AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
	ORIGIN: 'http://localhost:3100'
} as const;
const BUILD_PLACEHOLDER_FLAG = 'HUB_BUILD_ALLOW_PLACEHOLDERS';

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
					Object.entries(BUILD_ENV_DEFAULTS).map(([name, value]) => [
						name,
						baseEnv[name] ?? value
					])
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
