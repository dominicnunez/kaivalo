import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { TRUSTED_AVATAR_HOSTS } from './src/lib/server/trusted-hosts.js';

const TRUSTED_AVATAR_SOURCES = TRUSTED_AVATAR_HOSTS.map((host) => `https://${host}`);

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		csp: {
			mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self'],
					'font-src': ['self'],
				'img-src': [
					'self',
					'data:',
					...TRUSTED_AVATAR_SOURCES
				],
				'connect-src': ['self'],
				'form-action': ['self'],
				'base-uri': ['self'],
				'object-src': ['none'],
				'frame-src': ['none'],
				'frame-ancestors': ['none']
			}
		}
	}
};

export default config;
