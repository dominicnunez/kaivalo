import { pathToFileURL } from 'node:url';

export function isExecutedDirectly(
	moduleUrl: string,
	argv: readonly string[] = process.argv
): boolean {
	const entryPointPath = argv[1];
	if (typeof entryPointPath !== 'string' || entryPointPath.length === 0) {
		return false;
	}

	return moduleUrl === pathToFileURL(entryPointPath).href;
}
