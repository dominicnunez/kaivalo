import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const UI_WORKSPACE_SOURCE_DIR = path.join(ROOT, 'packages', 'ui');
const UI_RUNTIME_PACKAGE_DIR = path.join(
	ROOT,
	'node_modules',
	'@kaivalo',
	'ui'
);

export const UI_RUNTIME_PACKAGE_FILES = Object.freeze([
	'package.json',
	'index.ts',
	'index.d.ts',
	'svelte.d.ts',
	'props.ts',
	'Badge.svelte',
	'Button.svelte',
	'Card.svelte',
	'Container.svelte'
]);

export function materializeUiRuntimePackage({
	sourceDir = UI_WORKSPACE_SOURCE_DIR,
	destinationDir = UI_RUNTIME_PACKAGE_DIR
}: {
	sourceDir?: string;
	destinationDir?: string;
} = {}): void {
	rmSync(destinationDir, {
		recursive: true,
		force: true
	});
	mkdirSync(destinationDir, {
		recursive: true
	});

	for (const fileName of UI_RUNTIME_PACKAGE_FILES) {
		const sourcePath = path.join(sourceDir, fileName);
		if (!existsSync(sourcePath)) {
			throw new Error(
				`Missing required runtime workspace package file: ${sourcePath}`
			);
		}

		cpSync(sourcePath, path.join(destinationDir, fileName));
	}
}

function main(): void {
	materializeUiRuntimePackage();
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
