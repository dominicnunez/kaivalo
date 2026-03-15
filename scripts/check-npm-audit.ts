import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const AUDIT_SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4));
export const AUDIT_TIMEOUT_MS = 90_000;
export const AUDIT_MAX_ATTEMPTS = 3;
export const AUDIT_RETRY_DELAY_MS = 5_000;
const AUDIT_COMMAND_ARGS = ['audit', '--json'];
const AUDIT_RETRYABLE_ERROR_CODES = new Set([
	'ETIMEDOUT',
	'EAI_AGAIN',
	'ENOTFOUND',
	'ECONNRESET',
	'ECONNREFUSED',
	'EHOSTUNREACH',
	'ENETUNREACH',
	'ERR_SOCKET_TIMEOUT'
]);
const AUDIT_RETRYABLE_STDERR_PATTERNS = [
	/\bEAI_AGAIN\b/i,
	/\bENOTFOUND\b/i,
	/\bECONNRESET\b/i,
	/\bECONNREFUSED\b/i,
	/\bEHOSTUNREACH\b/i,
	/\bENETUNREACH\b/i,
	/\bERR_SOCKET_TIMEOUT\b/i,
	/\bE(?:408|429|500|502|503|504)\b/i,
	/\b(?:408|429|500|502|503|504)\b/,
	/\bservice unavailable\b/i,
	/\bbad gateway\b/i,
	/\bgateway timeout\b/i,
	/\brequest timeout\b/i,
	/\btoo many requests\b/i
];
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

function sleepSync(delayMs) {
	if (delayMs <= 0) {
		return;
	}

	Atomics.wait(AUDIT_SLEEP_BUFFER, 0, 0, delayMs);
}

function readAuditErrorCode(value) {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.trim().toUpperCase();
	return normalized === '' ? null : normalized;
}

function isRetryableAuditError(error) {
	const code = readAuditErrorCode(error.code);
	if (code && AUDIT_RETRYABLE_ERROR_CODES.has(code)) {
		return true;
	}

	return (
		typeof error.message === 'string' &&
		AUDIT_RETRYABLE_STDERR_PATTERNS.some((pattern) =>
			pattern.test(error.message)
		)
	);
}

function isTimeoutAuditError(error) {
	return readAuditErrorCode(error.code) === 'ETIMEDOUT';
}

function readRetryableAuditFailureMessage(auditResult) {
	const stderr = auditResult.stderr?.trim();
	if (
		stderr &&
		AUDIT_RETRYABLE_STDERR_PATTERNS.some((pattern) => pattern.test(stderr))
	) {
		return stderr;
	}

	return null;
}

function throwRetryableAuditFailure(
	message,
	maxAttempts,
	timeoutMs,
	isTimeout
) {
	if (isTimeout) {
		throw new Error(
			`npm audit exceeded ${timeoutMs}ms timeout after ${maxAttempts} attempts`
		);
	}

	throw new Error(`npm audit failed after ${maxAttempts} attempts: ${message}`);
}

export function runAudit({
	spawnSyncImpl = spawnSync,
	timeoutMs = AUDIT_TIMEOUT_MS,
	maxAttempts = AUDIT_MAX_ATTEMPTS,
	retryDelayMs = AUDIT_RETRY_DELAY_MS,
	sleepImpl = sleepSync
} = {}) {
	if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
		throw new Error('npm audit maxAttempts must be a positive integer');
	}

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		const auditResult = spawnSyncImpl('npm', AUDIT_COMMAND_ARGS, {
			cwd: ROOT,
			encoding: 'utf8',
			timeout: timeoutMs
		});

		if (auditResult.error) {
			if (isRetryableAuditError(auditResult.error)) {
				if (attempt === maxAttempts) {
					throwRetryableAuditFailure(
						auditResult.error.message,
						maxAttempts,
						timeoutMs,
						isTimeoutAuditError(auditResult.error)
					);
				}

				sleepImpl(retryDelayMs * attempt);
				continue;
			}

			throw new Error(`npm audit failed: ${auditResult.error.message}`, {
				cause: auditResult.error
			});
		}

		const stdout = auditResult.stdout ?? '';
		if (stdout.trim() === '') {
			const retryableFailureMessage =
				readRetryableAuditFailureMessage(auditResult);
			if (retryableFailureMessage) {
				if (attempt === maxAttempts) {
					throwRetryableAuditFailure(
						retryableFailureMessage,
						maxAttempts,
						timeoutMs,
						false
					);
				}

				sleepImpl(retryDelayMs * attempt);
				continue;
			}

			if (auditResult.status !== 0 && auditResult.status !== 1) {
				throw new Error(buildAuditFailureMessage(auditResult));
			}

			throw new Error('npm audit did not return JSON output');
		}

		return parseAuditReport(stdout);
	}

	throw new Error(
		`npm audit exceeded ${timeoutMs}ms timeout after ${maxAttempts} attempts`
	);
}

function setProcessExitCode(code) {
	process.exitCode = code;
}

type CliDependencies = {
	readAllowlistImpl?: typeof readAllowlist;
	runAuditImpl?: typeof runAudit;
	collectAuditAdvisoriesImpl?: typeof collectAuditAdvisories;
	findUnallowlistedAdvisoriesImpl?: typeof findUnallowlistedAdvisories;
	writeStdout?: (message: string) => void;
	writeStderr?: (message: string) => void;
	setExitCode?: (code: number) => void;
};

export function main() {
	return mainWithDependencies();
}

export function mainWithDependencies({
	readAllowlistImpl = readAllowlist,
	runAuditImpl = runAudit,
	collectAuditAdvisoriesImpl = collectAuditAdvisories,
	findUnallowlistedAdvisoriesImpl = findUnallowlistedAdvisories,
	writeStdout = console.log,
	writeStderr = console.error,
	setExitCode = setProcessExitCode
}: CliDependencies = {}) {
	const allowlist = readAllowlistImpl();
	const advisories = collectAuditAdvisoriesImpl(runAuditImpl());
	const unallowlistedAdvisories = findUnallowlistedAdvisoriesImpl(
		advisories,
		allowlist
	);

	if (unallowlistedAdvisories.length === 0) {
		writeStdout(
			`npm audit passed with ${advisories.length} allowlisted advisories`
		);
		return;
	}

	writeStderr(
		`npm audit reported unallowlisted advisories:\n${formatAdvisories(unallowlistedAdvisories)}`
	);
	setExitCode(1);
}

export function reportCliFailure(
	error: unknown,
	{
		writeStderr = console.error,
		setExitCode = setProcessExitCode
	}: Pick<CliDependencies, 'writeStderr' | 'setExitCode'> = {}
): void {
	const message =
		error instanceof Error ? error.message : 'npm audit failed unexpectedly';
	writeStderr(message);
	setExitCode(1);
}

export function runCli(options: CliDependencies = {}) {
	try {
		mainWithDependencies(options);
	} catch (error) {
		reportCliFailure(error, options);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	runCli();
}
