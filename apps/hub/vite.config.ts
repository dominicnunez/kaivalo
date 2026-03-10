import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import { sanitizeProductionBundle } from './scripts/build-artifacts.ts';

function sanitizeProductionArtifacts(): Plugin {
	let isServerBuild = false;

	return {
		name: 'sanitize-production-artifacts',
		apply: 'build',
		configResolved(config) {
			isServerBuild = Boolean(config.build.ssr);
		},
		generateBundle(_options, bundle) {
			sanitizeProductionBundle(bundle as never, { isServerBuild });
		}
	};
}

export default defineConfig({
	plugins: [tailwindcss(), sanitizeProductionArtifacts(), sveltekit()],
	preview: {
		allowedHosts: ['localhost']
	}
});
