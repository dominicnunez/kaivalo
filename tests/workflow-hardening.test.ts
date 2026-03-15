import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEPLOY_WORKFLOW_PATH = path.join(
	ROOT,
	'.github',
	'workflows',
	'deploy.yml'
);
const TRACK_SVELTEKIT_UPSTREAM_WORKFLOW_PATH = path.join(
	ROOT,
	'.github',
	'workflows',
	'track-sveltekit-upstream.yml'
);
const EXPECTED_DEPLOY_JOB_TIMEOUTS = {
	test: 45,
	build: 20,
	smoke_test: 15,
	deploy: 15
} as const;

type WorkflowRecord = Record<string, unknown>;

type WorkflowStep = {
	name?: string;
	with: Record<string, string>;
};

function isRecord(value: unknown): value is WorkflowRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, message: string): WorkflowRecord {
	assert.ok(isRecord(value), message);
	return value;
}

function readNumber(value: unknown, message: string): number {
	assert.strictEqual(typeof value, 'number', message);
	return value;
}

function readOptionalString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function readStringRecord(
	value: unknown,
	message: string
): Record<string, string> {
	const record = readRecord(value, message);
	return Object.fromEntries(
		Object.entries(record).map(([key, entryValue]) => {
			assert.ok(
				typeof entryValue === 'string' ||
					typeof entryValue === 'number' ||
					typeof entryValue === 'boolean',
				`${message}: ${key} should be a scalar`
			);
			return [key, String(entryValue)];
		})
	);
}

function readWorkflow(workflowPath: string): WorkflowRecord {
	return readRecord(
		parse(readFileSync(workflowPath, 'utf8')),
		`${path.basename(workflowPath)} should parse as a workflow object`
	);
}

function getWorkflowJob(
	workflow: WorkflowRecord,
	jobName: string
): WorkflowRecord {
	const jobs = readRecord(workflow.jobs, 'workflow should define jobs');
	return readRecord(jobs[jobName], `job ${jobName} should exist`);
}

function getWorkflowJobTimeoutMinutes(
	workflow: WorkflowRecord,
	jobName: string
): number {
	return readNumber(
		getWorkflowJob(workflow, jobName)['timeout-minutes'],
		`job ${jobName} should define timeout-minutes`
	);
}

function normalizeWorkflowStep(
	step: unknown,
	description: string
): WorkflowStep {
	const record = readRecord(step, `${description} should be an object`);
	return {
		name: readOptionalString(record.name),
		with: isRecord(record.with)
			? readStringRecord(
					record.with,
					`${description} with block should use string values`
				)
			: {}
	};
}

function getWorkflowStep(
	workflow: WorkflowRecord,
	jobName: string,
	stepName: string
) {
	const job = getWorkflowJob(workflow, jobName);
	assert.ok(Array.isArray(job.steps), `job ${jobName} should define steps`);
	const step = job.steps
		.map((entry, index) =>
			normalizeWorkflowStep(entry, `job ${jobName} step ${index + 1}`)
		)
		.find((entry) => entry.name === stepName);
	assert.ok(step, `job ${jobName} should define step ${stepName}`);
	return step;
}

describe('workflow hardening', () => {
	it('bounds every deploy workflow job with an explicit timeout', () => {
		const workflow = readWorkflow(DEPLOY_WORKFLOW_PATH);

		for (const [jobName, timeoutMinutes] of Object.entries(
			EXPECTED_DEPLOY_JOB_TIMEOUTS
		)) {
			assert.strictEqual(
				getWorkflowJobTimeoutMinutes(workflow, jobName),
				timeoutMinutes
			);
		}
	});

	it('ignores pull requests when reusing an upstream tracking issue', () => {
		const workflow = readWorkflow(TRACK_SVELTEKIT_UPSTREAM_WORKFLOW_PATH);
		const step = getWorkflowStep(
			workflow,
			'check',
			'Find existing tracking issue'
		);
		const script = step.with.script ?? '';

		assert.match(script, /issues\.listForRepo/);
		assert.match(script, /!issue\.pull_request/);
		assert.match(script, /issue\.title === title/);
	});
});
