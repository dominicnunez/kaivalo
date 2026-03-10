import { readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const TEXT_ARTIFACT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json']);
const SOURCE_MAP_COMMENT_PATTERN = /\n?\/\/# sourceMappingURL=.*$/gm;
const FILENAME_IMPORT_ALIAS_PATTERN = /\bF as ([A-Za-z_$][\w$]*)\b/g;

type BundleChunk = {
	type: 'chunk';
	fileName: string;
	code: string;
};

type BundleAsset = {
	type: 'asset';
	fileName: string;
};

type BundleEntry = BundleChunk | BundleAsset;

type BundleShape = Record<string, BundleEntry>;

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeFilenameMetadataValue(value: string): string {
	const normalized = value.replaceAll('\\', '/');
	if (!normalized.includes('/')) {
		return value;
	}

	return path.posix.basename(normalized);
}

function sanitizeFilenameMetadata(code: string): string {
	const aliases = new Set(['FILENAME']);
	for (const match of code.matchAll(FILENAME_IMPORT_ALIAS_PATTERN)) {
		aliases.add(match[1]);
	}

	const aliasPattern = [...aliases].map(escapeRegExp).join('|');
	const filenameAssignmentPattern = new RegExp(
		`(\\b[A-Za-z_$][\\w$]*)\\[((?:${aliasPattern}))\\]\\s*=\\s*(['"])([^"'\\\\]*(?:\\\\.[^"'\\\\]*)*)\\3`,
		'g'
	);

	return code.replace(
		filenameAssignmentPattern,
		(match, target: string, alias: string, quote: string, value: string) => {
			const sanitizedValue = sanitizeFilenameMetadataValue(value);
			if (sanitizedValue === value) {
				return match;
			}

			return `${target}[${alias}]=${quote}${sanitizedValue}${quote}`;
		}
	);
}

function stripSourceMapComment(code: string): string {
	return code.replace(SOURCE_MAP_COMMENT_PATTERN, '');
}

export function getHubBuildPaths(
	hubRoot = path.resolve(import.meta.dirname, '..')
) {
	const buildDir = path.join(hubRoot, 'build');
	return {
		buildDir,
		clientDir: path.join(buildDir, 'client'),
		serverDir: path.join(buildDir, 'server'),
		repoRoot: path.resolve(hubRoot, '..', '..')
	};
}

export function readFilesRecursively(
	directory: string,
	filter: (filePath: string) => boolean
): string[] {
	const entries = readdirSync(directory, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...readFilesRecursively(entryPath, filter));
			continue;
		}

		if (filter(entryPath)) {
			files.push(entryPath);
		}
	}

	return files;
}

export function findProductionArtifactLeaks(
	buildDir: string,
	repoRoot: string
): { pathLeaks: string[]; serverSourceMaps: string[] } {
	const textArtifactFiles = readFilesRecursively(buildDir, (filePath) =>
		TEXT_ARTIFACT_EXTENSIONS.has(path.extname(filePath))
	);
	const pathLeaks = textArtifactFiles.filter((filePath) =>
		readFileSync(filePath, 'utf8').includes(repoRoot)
	);
	const serverSourceMaps = readFilesRecursively(
		path.join(buildDir, 'server'),
		(filePath) => filePath.endsWith('.map')
	);

	return { pathLeaks, serverSourceMaps };
}

export function removeServerSourceMaps(serverDir: string): void {
	for (const filePath of readFilesRecursively(serverDir, (entryPath) =>
		entryPath.endsWith('.map')
	)) {
		rmSync(filePath, { force: true });
	}
}

export function sanitizeProductionBundle(
	bundle: BundleShape,
	options: { isServerBuild: boolean }
): void {
	for (const [fileName, entry] of Object.entries(bundle)) {
		if (entry.type === 'asset') {
			if (options.isServerBuild && fileName.endsWith('.map')) {
				delete bundle[fileName];
			}
			continue;
		}

		let nextCode = sanitizeFilenameMetadata(entry.code);
		if (options.isServerBuild) {
			nextCode = stripSourceMapComment(nextCode);
		}

		entry.code = nextCode;
	}
}
