import kaivaloPreset from '@kaivalo/config/tailwind.preset.js';

/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	presets: [kaivaloPreset],
	theme: {
		extend: {}
	},
	plugins: []
};
