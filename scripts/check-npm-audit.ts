import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
export const AUDIT_TIMEOUT_MS = 30_000;
const ALLOWLIST_PATH = resolve(
	ROOT,
	'audit',
	'exceptions',
	'npm-audit-allowlist.json'
);

/**
 * @typedef {{
 *   package: string;
 *   source: number;
 *   severity: string;
 *   title: string;
 *   path?: string;
 *   url?: string;
 *   reason?: string;
 * }} AuditAllowlistEntry
 */

/**
 * @typedef {{
 *   package: string;
 *   source: number;
 *   severity: string;
 *   title: string;
 *   url?: string;
 *   path?: string;
 * }} AuditAdvisory
 */

/**
 * @param {string} filePath
 * @returns {AuditAllowlistEntry[]}
 */
export function readAllowlist(filePath = ALLOWLIST_PATH) {
	const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
	if (!Array.isArray(parsed)) {
		throw new Error('npm audit allowlist must be an array');
	}

	return parsed.map((entry, index) => validateAllowlistEntry(entry, index));
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @param {number} entryIndex
 * @returns {string}
 */
function readRequiredAllowlistString(value, fieldName, entryIndex) {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new Error(
			`npm audit allowlist entry ${entryIndex + 1} must include a non-empty ${fieldName}`
		);
	}

	return value.trim();
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @param {number} entryIndex
 * @returns {string | undefined}
 */
function readOptionalAllowlistString(value, fieldName, entryIndex) {
	if (value === undefined) {
		return undefined;
	}

	return readRequiredAllowlistString(value, fieldName, entryIndex);
}

/**
 * @param {unknown} entry
 * @param {number} entryIndex
 * @returns {AuditAllowlistEntry}
 */
function validateAllowlistEntry(entry, entryIndex) {
	if (!entry || typeof entry !== 'object') {
		throw new Error(
			`npm audit allowlist entry ${entryIndex + 1} must be an object`
		);
	}

	const record = /** @type {Record<string, unknown>} */ entry;
	if (!Number.isInteger(record.source)) {
		throw new Error(
			`npm audit allowlist entry ${entryIndex + 1} must include an integer source`
		);
	}

	return {
		package: readRequiredAllowlistString(record.package, 'package', entryIndex),
		source: record.source,
		severity: readRequiredAllowlistString(
			record.severity,
			'severity',
			entryIndex
		).toLowerCase(),
		title: readRequiredAllowlistString(record.title, 'title', entryIndex),
		path: readOptionalAllowlistString(record.path, 'path', entryIndex),
		url: readOptionalAllowlistString(record.url, 'url', entryIndex),
		reason: readOptionalAllowlistString(record.reason, 'reason', entryIndex)
	};
}

/**
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function readSeverity(value, fallback = 'unknown') {
	if (typeof value !== 'string') {
		return fallback;
	}

	const normalized = value.trim().toLowerCase();
	return normalized === '' ? fallback : normalized;
}

/**
 * @param {unknown} report
 * @returns {AuditAdvisory[]}
 */
export function collectAuditAdvisories(report) {
	if (!report || typeof report !== 'object' || !('vulnerabilities' in report)) {
		throw new Error('npm audit did not return a vulnerabilities report');
	}

	/** @type {AuditAdvisory[]} */
	const advisories = [];
	const vulnerabilities = report.vulnerabilities;
	if (!vulnerabilities || typeof vulnerabilities !== 'object') {
		return advisories;
	}

	for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
		if (!vulnerability || typeof vulnerability !== 'object') {
			continue;
		}

		const severity =
			'severity' in vulnerability
				? readSeverity(vulnerability.severity)
				: 'unknown';
		const nodes =
			'nodes' in vulnerability && Array.isArray(vulnerability.nodes)
				? vulnerability.nodes.filter((node) => typeof node === 'string')
				: [];
		const via =
			'via' in vulnerability && Array.isArray(vulnerability.via)
				? vulnerability.via
				: [];

		for (const item of via) {
			if (!item || typeof item !== 'object') {
				continue;
			}
			if (
				!('source' in item) ||
				typeof item.source !== 'number' ||
				!('title' in item) ||
				typeof item.title !== 'string'
			) {
				continue;
			}

			const advisoryPackage =
				'name' in item && typeof item.name === 'string'
					? item.name
					: packageName;
			const advisoryUrl =
				'url' in item && typeof item.url === 'string' ? item.url : undefined;
			const advisorySeverity =
				'severity' in item ? readSeverity(item.severity, severity) : severity;

			if (nodes.length === 0) {
				advisories.push({
					package: advisoryPackage,
					source: item.source,
					severity: advisorySeverity,
					title: item.title,
					url: advisoryUrl
				});
				continue;
			}

			for (const path of nodes) {
				advisories.push({
					package: advisoryPackage,
					source: item.source,
					severity: advisorySeverity,
					title: item.title,
					url: advisoryUrl,
					path
				});
			}
		}
	}

	return advisories;
}

/**
 * @param {AuditAdvisory} advisory
 * @param {AuditAllowlistEntry} allowlistEntry
 * @returns {boolean}
 */
function matchesAllowlist(advisory, allowlistEntry) {
	return (
		advisory.package === allowlistEntry.package &&
		advisory.source === allowlistEntry.source &&
		advisory.severity.toLowerCase() === allowlistEntry.severity &&
		advisory.title === allowlistEntry.title &&
		(allowlistEntry.path === undefined ||
			advisory.path === allowlistEntry.path) &&
		(allowlistEntry.url === undefined || advisory.url === allowlistEntry.url)
	);
}

/**
 * @param {AuditAdvisory[]} advisories
 * @param {AuditAllowlistEntry[]} allowlist
 * @returns {AuditAdvisory[]}
 */
export function findUnallowlistedAdvisories(advisories, allowlist) {
	return advisories.filter(
		(advisory) =>
			!allowlist.some((allowlistEntry) =>
				matchesAllowlist(advisory, allowlistEntry)
			)
	);
}

/**
 * @param {AuditAdvisory[]} advisories
 * @returns {string}
 */
function formatAdvisories(advisories) {
	return advisories
		.map((advisory) => {
			const location = advisory.path ? ` at ${advisory.path}` : '';
			return `- ${advisory.package} (${advisory.severity}) source ${advisory.source}${location}: ${advisory.title}`;
		})
		.join('\n');
}

function buildAuditFailureMessage(auditResult) {
	const stderr = auditResult.stderr?.trim();
	if (stderr) {
		return `npm audit failed: ${stderr}`;
	}

	if (auditResult.signal) {
		return `npm audit failed: terminated by ${auditResult.signal}`;
	}

	if (typeof auditResult.status === 'number') {
		return `npm audit failed with exit status ${auditResult.status}`;
	}

	return 'npm audit failed';
}

/**
 * @param {string} output
 * @returns {unknown}
 */
function parseAuditReport(output) {
	try {
		return JSON.parse(output);
	} catch (error) {
		throw new Error('npm audit returned invalid JSON', { cause: error });
	}
}

export function runAudit({
	spawnSyncImpl = spawnSync,
	timeoutMs = AUDIT_TIMEOUT_MS
} = {}) {
	const auditResult = spawnSyncImpl('npm', ['audit', '--omit=dev', '--json'], {
		cwd: ROOT,
		encoding: 'utf8',
		timeout: timeoutMs
	});

	if (auditResult.error) {
		if (auditResult.error.code === 'ETIMEDOUT') {
			throw new Error(`npm audit exceeded ${timeoutMs}ms timeout`);
		}

		throw new Error(`npm audit failed: ${auditResult.error.message}`, {
			cause: auditResult.error
		});
	}

	const stdout = auditResult.stdout ?? '';
	if (
		auditResult.status !== 0 &&
		auditResult.status !== 1 &&
		stdout.trim() === ''
	) {
		throw new Error(buildAuditFailureMessage(auditResult));
	}

	if (stdout.trim() === '') {
		throw new Error('npm audit did not return JSON output');
	}

	return parseAuditReport(stdout);
}

export function main() {
	const allowlist = readAllowlist();
	const advisories = collectAuditAdvisories(runAudit());
	const unallowlistedAdvisories = findUnallowlistedAdvisories(
		advisories,
		allowlist
	);

	if (unallowlistedAdvisories.length === 0) {
		console.log(
			`npm audit passed with ${advisories.length} allowlisted production advisories`
		);
		return;
	}

	console.error(
		`npm audit reported unallowlisted production advisories:\n${formatAdvisories(unallowlistedAdvisories)}`
	);
	process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
