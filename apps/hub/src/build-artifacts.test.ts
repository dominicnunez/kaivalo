import { describe, expect, it } from 'vitest';
import { sanitizeProductionBundle } from '../scripts/build-artifacts.ts';
import { RUNTIME_SERVER_FILES } from '../scripts/runtime-server-files.ts';

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

		const { code } = bundle['server/index.js'];
		expect(code).toMatch(/meta\[FILENAME\]="\+page\.svelte"/);
		expect(code).not.toContain('/workspace/apps/hub/src/routes/+page.svelte');
		expect(code).not.toMatch(/meta\[FILENAME\]="[^"]*[\\/][^"]+"/);
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

		const { code } = bundle['server/index.js'];
		expect(code).toMatch(
			/import\{F as [A-Za-z_$][\w$]*\}from"\.\/shared\.js";/
		);
		expect(code).toMatch(/meta\[[A-Za-z_$][\w$]*\]="server\.ts"/);
		expect(code).not.toContain(
			'C:\\\\repo\\\\apps\\\\hub\\\\src\\\\lib\\\\server.ts'
		);
		expect(code).not.toMatch(/meta\[[A-Za-z_$][\w$]*\]="[^"]*[\\/][^"]+"/);
	});

	it('includes shared runtime helpers needed by the packaged server', () => {
		expect(RUNTIME_SERVER_FILES).toContain('port.ts');
	});
});
