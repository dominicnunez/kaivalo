import { describe, expect, it } from 'vitest';
import { sanitizeProductionBundle } from '../scripts/build-artifacts.ts';

type BundleShape = Parameters<typeof sanitizeProductionBundle>[0];

describe('build artifact sanitization', () => {
	it('rewrites filename metadata to basenames for the default export alias', () => {
		const bundle = {
			'server/index.js': {
				type: 'chunk' as const,
				fileName: 'server/index.js',
				code: 'const meta={};meta[FILENAME]="/workspace/apps/hub/src/routes/+page.svelte";'
			}
		} satisfies BundleShape;

		sanitizeProductionBundle(bundle, { isServerBuild: false });

		expect(bundle['server/index.js']).toMatchObject({
			code: 'const meta={};meta[FILENAME]="+page.svelte";'
		});
	});

	it('rewrites filename metadata for imported filename aliases', () => {
		const bundle = {
			'server/index.js': {
				type: 'chunk' as const,
				fileName: 'server/index.js',
				code: 'import{F as a}from"./shared.js";const meta={};meta[a]="C:\\\\repo\\\\apps\\\\hub\\\\src\\\\lib\\\\server.ts";'
			}
		} satisfies BundleShape;

		sanitizeProductionBundle(bundle, { isServerBuild: false });

		expect(bundle['server/index.js']).toMatchObject({
			code: 'import{F as a}from"./shared.js";const meta={};meta[a]="server.ts";'
		});
	});
});
