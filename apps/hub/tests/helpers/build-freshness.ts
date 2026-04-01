import { existsSync, lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';

const newestMtimeCache = new Map<string, number>();

function getDirectoryKey(stats: import('node:fs').Stats): string {
	return `${stats.dev}:${stats.ino}`;
}

/**
 * Clears the process-level mtime memoization cache.
 */
export function clearNewestMtimeCache() {
	newestMtimeCache.clear();
}

export function getNewestMtimeMs(
	targetPath: string,
	visitedDirectories = new Set<string>()
): number {
	const isTopLevelCall = visitedDirectories.size === 0;
	if (isTopLevelCall && newestMtimeCache.has(targetPath)) {
		return newestMtimeCache.get(targetPath) ?? 0;
	}

	let newestMtimeMs = 0;
	if (!existsSync(targetPath)) {
		if (isTopLevelCall) {
			newestMtimeCache.set(targetPath, newestMtimeMs);
		}
		return newestMtimeMs;
	}

	const stats = lstatSync(targetPath);
	if (stats.isSymbolicLink()) {
		if (isTopLevelCall) {
			newestMtimeCache.set(targetPath, newestMtimeMs);
		}
		return newestMtimeMs;
	}

	if (stats.isFile()) {
		newestMtimeMs = stats.mtimeMs;
		if (isTopLevelCall) {
			newestMtimeCache.set(targetPath, newestMtimeMs);
		}
		return newestMtimeMs;
	}
	if (!stats.isDirectory()) {
		if (isTopLevelCall) {
			newestMtimeCache.set(targetPath, newestMtimeMs);
		}
		return newestMtimeMs;
	}

	const directoryKey = getDirectoryKey(stats);
	if (visitedDirectories.has(directoryKey)) {
		if (isTopLevelCall) {
			newestMtimeCache.set(targetPath, newestMtimeMs);
		}
		return newestMtimeMs;
	}
	visitedDirectories.add(directoryKey);

	newestMtimeMs = stats.mtimeMs;
	for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
		const entryPath = path.join(targetPath, entry.name);
		const entryMtimeMs = getNewestMtimeMs(entryPath, visitedDirectories);
		if (entryMtimeMs > newestMtimeMs) {
			newestMtimeMs = entryMtimeMs;
		}
	}

	if (isTopLevelCall) {
		newestMtimeCache.set(targetPath, newestMtimeMs);
	}
	return newestMtimeMs;
}
