import { spawnSync } from 'node:child_process';

const BUILD_ENV_DEFAULTS = {
	WORKOS_CLIENT_ID: 'client_build_placeholder',
	WORKOS_API_KEY: 'sk_build_placeholder',
	WORKOS_REDIRECT_URI: 'http://localhost:3100/auth/callback',
	WORKOS_COOKIE_PASSWORD: 'ab'.repeat(32),
	AUTH_ERROR_SIGNING_SECRET: 'cd'.repeat(32),
	ORIGIN: 'http://localhost:3100'
} as const;

export function getHubBuildEnv(
	baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
	return {
		...baseEnv,
		...Object.fromEntries(
			Object.entries(BUILD_ENV_DEFAULTS).map(([name, value]) => [
				name,
				baseEnv[name] ?? value
			])
		)
	};
}

export function runHubBuildWithEnv(): void {
	const steps = [
		['vite', 'build'],
		['node', 'scripts/prepare-runtime.ts']
	] as const;

	for (const [command, ...args] of steps) {
		const result = spawnSync(command, args, {
			stdio: 'inherit',
			env: getHubBuildEnv()
		});

		if (result.status === 0) {
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
