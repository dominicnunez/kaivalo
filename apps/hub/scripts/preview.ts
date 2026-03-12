import { existsSync } from 'node:fs';
import path from 'node:path';
import { getHubPreviewEnv } from './build-env.ts';
import { applyHubRuntimeEnv, getHubPreviewBaseEnv } from './runtime-env.ts';

const HUB_ROOT = path.resolve(import.meta.dirname, '..');
const REQUIRED_PREVIEW_ARTIFACTS = [
	path.join(HUB_ROOT, 'build', 'handler.js'),
	path.join(HUB_ROOT, 'build', 'runtime', 'server', 'node-server.ts')
];

for (const artifactPath of REQUIRED_PREVIEW_ARTIFACTS) {
	if (existsSync(artifactPath)) {
		continue;
	}

	throw new Error(
		'Preview requires a built hub runtime. Run `npm run build` first.'
	);
}

applyHubRuntimeEnv(
	process.env,
	getHubPreviewEnv(getHubPreviewBaseEnv(process.env))
);

await import('../server.ts');
