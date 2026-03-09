import { readFileSync } from 'node:fs';
import path from 'node:path';

type DockerIgnoreRule = {
	negated: boolean;
	pattern: string;
};

function normalizePath(candidate: string): string {
	return candidate
		.replace(/\\/g, '/')
		.replace(/^\.\/+/, '')
		.replace(/^\/+/, '')
		.replace(/\/+/g, '/')
		.replace(/\/$/, '');
}

function normalizePattern(candidate: string): string {
	return normalizePath(candidate.trim().replace(/^!/, ''));
}

function hasGlob(pattern: string): boolean {
	return /[*?[\]{}]/.test(pattern);
}

function matchPathSegments(candidate: string, pattern: string): boolean {
	if (pattern === '') {
		return false;
	}

	if (hasGlob(pattern)) {
		return (
			path.matchesGlob(candidate, pattern) ||
			(!pattern.includes('/') && path.matchesGlob(candidate, `**/${pattern}`))
		);
	}

	if (!pattern.includes('/')) {
		return candidate.split('/').includes(pattern);
	}

	return candidate === pattern || candidate.startsWith(`${pattern}/`);
}

function parseDockerIgnoreRules(contents: string): DockerIgnoreRule[] {
	return contents
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '' && !line.startsWith('#'))
		.map((line) => ({
			negated: line.startsWith('!'),
			pattern: normalizePattern(line)
		}))
		.filter((rule) => rule.pattern !== '');
}

export function isIgnoredByDockerIgnore(
	candidate: string,
	contents: string
): boolean {
	const normalizedCandidate = normalizePath(candidate);
	let ignored = false;

	for (const rule of parseDockerIgnoreRules(contents)) {
		if (!matchPathSegments(normalizedCandidate, rule.pattern)) {
			continue;
		}

		ignored = !rule.negated;
	}

	return ignored;
}

export function readDockerIgnore(rootDir: string): string {
	return readFileSync(path.join(rootDir, '.dockerignore'), 'utf8');
}
