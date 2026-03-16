import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const ROOT = path.resolve(import.meta.dirname, '..');
const CI_WORKFLOW_PATH = path.join(ROOT, '.github', 'workflows', 'ci.yml');
const DAILY_FULL_SUITE_WORKFLOW_PATH = path.join(
	ROOT,
	'.github',
	'workflows',
	'daily-full-suite.yml'
);
const DEPLOY_WORKFLOW_PATH = path.join(
	ROOT,
	'.github',
	'workflows',
	'deploy.yml'
);
const DOCKERFILE_PATH = path.join(ROOT, 'Dockerfile');
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json');
const PRE_PUSH_HOOK_PATH = path.join(ROOT, '.husky', 'pre-push');
const TRACK_SVELTEKIT_UPSTREAM_WORKFLOW_PATH = path.join(
	ROOT,
	'.github',
	'workflows',
	'track-sveltekit-upstream.yml'
);
const DEPLOYABLE_REF_CONDITION =
	"github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')";
const FULL_LENGTH_ACTION_REF_PATTERN =
	/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}$/;
const PINNED_NODE_VERSION_PATTERN = /^FROM node:(\d+\.\d+\.\d+)-/m;

type WorkflowRecord = Record<string, unknown>;

type WorkflowStep = {
	name?: string;
	if?: string;
	uses?: string;
	run?: string;
	with: Record<string, string>;
	env: Record<string, string>;
};

function isRecord(value: unknown): value is WorkflowRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, message: string): WorkflowRecord {
	assert.ok(isRecord(value), message);
	return value;
}

function readString(value: unknown, message: string): string {
	assert.strictEqual(typeof value, 'string', message);
	return value;
}

function readOptionalString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function readScalarString(value: unknown, message: string): string {
	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return String(value);
	}

	assert.fail(message);
}

function readStringRecord(
	value: unknown,
	message: string
): Record<string, string> {
	const record = readRecord(value, message);
	return Object.fromEntries(
		Object.entries(record).map(([key, entryValue]) => [
			key,
			readScalarString(entryValue, `${message}: ${key} should be a scalar`)
		])
	);
}

function readWorkflow(workflowPath: string): WorkflowRecord {
	return readRecord(
		parse(readFileSync(workflowPath, 'utf8')),
		`${path.basename(workflowPath)} should parse as a workflow object`
	);
}

function normalizeShellScript(value: string): string {
	return value
		.replace(/\\\s*\n/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function getPinnedNodeVersionFromDockerfile(): string {
	const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
	const match = dockerfile.match(PINNED_NODE_VERSION_PATTERN);
	assert.ok(match, 'Dockerfile should pin a Node runtime image');
	return match[1] ?? '';
}

function getWorkflowTriggers(workflow: WorkflowRecord) {
	const triggerBlock = readRecord(
		workflow.on,
		'workflow should define an on block'
	);
	const schedule = Array.isArray(triggerBlock.schedule)
		? triggerBlock.schedule.map((entry, index) =>
				readString(
					readRecord(
						entry,
						`workflow schedule ${index + 1} should be an object`
					).cron,
					`workflow schedule ${index + 1} should define cron`
				)
			)
		: [];

	return {
		triggers: new Set(Object.keys(triggerBlock)),
		schedule
	};
}

function getWorkflowPermissions(workflow: WorkflowRecord) {
	return readStringRecord(
		workflow.permissions,
		'workflow should define permissions'
	);
}

function getWorkflowJob(
	workflow: WorkflowRecord,
	jobName: string
): WorkflowRecord {
	const jobs = readRecord(workflow.jobs, 'workflow should define jobs');
	return readRecord(jobs[jobName], `job ${jobName} should exist`);
}

function getWorkflowJobPermissions(workflow: WorkflowRecord, jobName: string) {
	return readStringRecord(
		getWorkflowJob(workflow, jobName).permissions,
		`job ${jobName} should define permissions`
	);
}

function normalizeWorkflowStep(
	step: unknown,
	description: string
): WorkflowStep {
	const record = readRecord(step, `${description} should be an object`);
	return {
		name: readOptionalString(record.name),
		if: readOptionalString(record.if),
		uses: readOptionalString(record.uses),
		run: readOptionalString(record.run),
		with: isRecord(record.with)
			? readStringRecord(
					record.with,
					`${description} with block should use string values`
				)
			: {},
		env: isRecord(record.env)
			? readStringRecord(
					record.env,
					`${description} env block should use string values`
				)
			: {}
	};
}

function getWorkflowSteps(workflow: WorkflowRecord, jobName: string) {
	const job = getWorkflowJob(workflow, jobName);
	assert.ok(Array.isArray(job.steps), `job ${jobName} should define steps`);

	return job.steps.map((step, index) =>
		normalizeWorkflowStep(step, `job ${jobName} step ${index + 1}`)
	);
}

function getAllWorkflowSteps(workflow: WorkflowRecord) {
	const jobs = readRecord(workflow.jobs, 'workflow should define jobs');
	return Object.keys(jobs).flatMap((jobName) =>
		getWorkflowSteps(workflow, jobName)
	);
}

function getWorkflowRunCommands(workflow: WorkflowRecord, jobName: string) {
	return getWorkflowSteps(workflow, jobName)
		.flatMap((step) => (step.run ? [step.run] : []))
		.map(normalizeShellScript);
}

function getWorkflowJobCondition(workflow: WorkflowRecord, jobName: string) {
	return readString(
		getWorkflowJob(workflow, jobName).if,
		`job ${jobName} is missing an if condition`
	);
}

function getWorkflowJobNeeds(workflow: WorkflowRecord, jobName: string) {
	const needs = getWorkflowJob(workflow, jobName).needs;
	if (Array.isArray(needs)) {
		return needs.map((value, index) =>
			readString(
				value,
				`job ${jobName} needs entry ${index + 1} should be a string`
			)
		);
	}
	if (typeof needs === 'string') {
		return [needs];
	}

	assert.fail(`job ${jobName} should define needs`);
}

function findWorkflowStep(
	workflow: WorkflowRecord,
	jobName: string,
	predicate: (step: WorkflowStep) => boolean,
	description: string
) {
	const step = getWorkflowSteps(workflow, jobName).find(predicate);
	assert.ok(step, `job ${jobName} should define ${description}`);
	return step;
}

function includesSensitiveSecretReference(value: unknown): boolean {
	const sensitiveSecretPattern =
		/\$\{\{\s*secrets\.(?:WORKOS_[A-Z0-9_]+|AUTH_ERROR_SIGNING_SECRET|AVATAR_PROXY_SIGNING_SECRET|ORIGIN)\s*\}\}/;
	if (typeof value === 'string') {
		return sensitiveSecretPattern.test(value);
	}
	if (Array.isArray(value)) {
		return value.some((entry) => includesSensitiveSecretReference(entry));
	}
	if (isRecord(value)) {
		return Object.values(value).some((entry) =>
			includesSensitiveSecretReference(entry)
		);
	}

	return false;
}

function getPackageScripts() {
	const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
		scripts?: Record<string, string>;
	};
	assert.ok(packageJson.scripts, 'package.json should define scripts');
	return packageJson.scripts;
}

function getNpmRunInvocations(value: string): string[] {
	return Array.from(
		normalizeShellScript(value).matchAll(/\bnpm\s+run\s+([a-z0-9:-]+)/gi),
		(match) => match[1]
	);
}

describe('deployment runtime guardrails', () => {
	it('runs the fast verification lane on push and pull requests', () => {
		const workflow = readWorkflow(CI_WORKFLOW_PATH);
		const { triggers } = getWorkflowTriggers(workflow);
		const runCommands = getWorkflowRunCommands(workflow, 'verify');

		assert.ok(triggers.has('push'));
		assert.ok(triggers.has('pull_request'));
		assert.ok(runCommands.includes('npm run test:ci'));
		assert.ok(!runCommands.includes('npm run test:full'));
	});

	it('pins every workflow node setup step to the Docker runtime patch version', () => {
		const pinnedNodeVersion = getPinnedNodeVersionFromDockerfile();
		const workflowPaths = [
			CI_WORKFLOW_PATH,
			DEPLOY_WORKFLOW_PATH,
			DAILY_FULL_SUITE_WORKFLOW_PATH,
			TRACK_SVELTEKIT_UPSTREAM_WORKFLOW_PATH
		];

		for (const workflowPath of workflowPaths) {
			const workflow = readWorkflow(workflowPath);
			const setupNodeSteps = getAllWorkflowSteps(workflow).filter((step) =>
				step.uses?.startsWith('actions/setup-node@')
			);

			assert.ok(
				setupNodeSteps.length > 0,
				`${path.basename(workflowPath)} should define an actions/setup-node step`
			);
			for (const step of setupNodeSteps) {
				assert.strictEqual(step.with['node-version'], pinnedNodeVersion);
			}
		}
	});

	it('pins every external workflow action to a full commit sha', () => {
		const workflowPaths = [
			CI_WORKFLOW_PATH,
			DEPLOY_WORKFLOW_PATH,
			DAILY_FULL_SUITE_WORKFLOW_PATH,
			TRACK_SVELTEKIT_UPSTREAM_WORKFLOW_PATH
		];

		for (const workflowPath of workflowPaths) {
			const workflow = readWorkflow(workflowPath);
			const externalActionSteps = getAllWorkflowSteps(workflow).filter(
				(step) => typeof step.uses === 'string' && !step.uses.startsWith('./')
			);

			assert.ok(
				externalActionSteps.length > 0,
				`${path.basename(workflowPath)} should define at least one external action`
			);
			for (const step of externalActionSteps) {
				assert.match(
					step.uses!,
					FULL_LENGTH_ACTION_REF_PATTERN,
					`${path.basename(workflowPath)} step ${step.name ?? '(unnamed)'} should pin actions by full commit sha`
				);
			}
		}
	});

	it('runs the full verification lane before deploy build and rollout', () => {
		const workflow = readWorkflow(DEPLOY_WORKFLOW_PATH);
		const runCommands = getWorkflowRunCommands(workflow, 'test');

		assert.ok(runCommands.includes('npm run test:deploy'));
		assert.deepStrictEqual(getWorkflowJobNeeds(workflow, 'build'), ['test']);
		assert.deepStrictEqual(getWorkflowJobNeeds(workflow, 'smoke_test'), [
			'build'
		]);
		assert.deepStrictEqual(getWorkflowJobNeeds(workflow, 'deploy'), [
			'smoke_test'
		]);
	});

	it('smoke tests deployable refs with the shared built image', () => {
		const workflow = readWorkflow(DEPLOY_WORKFLOW_PATH);
		const runCommands = getWorkflowRunCommands(workflow, 'smoke_test');
		const smokeProbeStep = findWorkflowStep(
			workflow,
			'smoke_test',
			(step) =>
				normalizeShellScript(step.run ?? '').includes(
					'./scripts/build-production-image-smoke.sh'
				),
			'the shared smoke test step'
		);

		assert.strictEqual(
			getWorkflowJobCondition(workflow, 'build'),
			DEPLOYABLE_REF_CONDITION
		);
		assert.strictEqual(
			getWorkflowJobCondition(workflow, 'smoke_test'),
			DEPLOYABLE_REF_CONDITION
		);
		assert.ok(
			runCommands.includes('./scripts/build-production-image-smoke.sh')
		);
		assert.strictEqual(
			smokeProbeStep.env.PRODUCTION_IMAGE_SMOKE_SKIP_BUILD,
			'true'
		);
		assert.strictEqual(
			smokeProbeStep.env.PRODUCTION_IMAGE_SMOKE_TAG,
			'${{ needs.build.outputs.image_ref }}'
		);
	});

	it('verifies deployment health after rollout without runtime auth secrets', () => {
		const workflow = readWorkflow(DEPLOY_WORKFLOW_PATH);
		const deploySteps = getWorkflowSteps(workflow, 'deploy');
		const deployIndex = deploySteps.findIndex((step) =>
			normalizeShellScript(step.run ?? '').includes('deploy-app')
		);
		const verifyIndex = deploySteps.findIndex((step) =>
			normalizeShellScript(step.run ?? '').includes(
				'./scripts/verify-deploy-health.sh'
			)
		);

		assert.strictEqual(
			getWorkflowJobCondition(workflow, 'deploy'),
			DEPLOYABLE_REF_CONDITION
		);
		assert.ok(deployIndex >= 0, 'deploy job should define a rollout step');
		assert.ok(
			verifyIndex > deployIndex,
			'deploy job should verify health after the rollout step succeeds'
		);

		const verifyStep = deploySteps[verifyIndex];
		assert.ok(
			verifyStep,
			'deploy job should define a health verification step'
		);
		assert.strictEqual(
			verifyStep.env.DEPLOY_ORIGIN,
			'${{ vars.DEPLOY_ORIGIN }}'
		);
		assert.strictEqual(
			verifyStep.env.WORKOS_API_HOSTNAME,
			'${{ vars.WORKOS_API_HOSTNAME }}'
		);
		assert.strictEqual(includesSensitiveSecretReference(verifyStep), false);
	});

	it('runs scheduled full-suite verification outside regular ci', () => {
		const workflow = readWorkflow(DAILY_FULL_SUITE_WORKFLOW_PATH);
		const { triggers, schedule } = getWorkflowTriggers(workflow);
		const verifyCommands = getWorkflowRunCommands(workflow, 'verify');
		const smokeCommands = getWorkflowRunCommands(workflow, 'docker_smoke');

		assert.ok(triggers.has('workflow_dispatch'));
		assert.ok(schedule.length > 0, 'daily full suite should define a schedule');
		assert.ok(verifyCommands.includes('npm run test:full'));
		assert.deepStrictEqual(getWorkflowJobNeeds(workflow, 'docker_smoke'), [
			'verify'
		]);
		assert.ok(
			smokeCommands.includes('./scripts/build-production-image-smoke.sh')
		);
	});

	it('keeps workflow permissions scoped to the minimum required access', () => {
		const ciWorkflow = readWorkflow(CI_WORKFLOW_PATH);
		const dailyFullSuiteWorkflow = readWorkflow(DAILY_FULL_SUITE_WORKFLOW_PATH);
		const deployWorkflow = readWorkflow(DEPLOY_WORKFLOW_PATH);
		const trackSvelteKitUpstreamWorkflow = readWorkflow(
			TRACK_SVELTEKIT_UPSTREAM_WORKFLOW_PATH
		);

		assert.deepStrictEqual(getWorkflowPermissions(ciWorkflow), {
			contents: 'read'
		});
		assert.deepStrictEqual(getWorkflowPermissions(dailyFullSuiteWorkflow), {
			contents: 'read'
		});
		assert.deepStrictEqual(
			getWorkflowPermissions(trackSvelteKitUpstreamWorkflow),
			{
				contents: 'read',
				issues: 'write'
			}
		);
		assert.strictEqual(
			deployWorkflow.permissions,
			undefined,
			'deploy workflow should scope permissions per job rather than globally'
		);
		assert.deepStrictEqual(getWorkflowJobPermissions(deployWorkflow, 'test'), {
			contents: 'read'
		});
		assert.deepStrictEqual(getWorkflowJobPermissions(deployWorkflow, 'build'), {
			contents: 'read',
			packages: 'write'
		});
		assert.deepStrictEqual(
			getWorkflowJobPermissions(deployWorkflow, 'smoke_test'),
			{
				contents: 'read',
				packages: 'read'
			}
		);
		assert.deepStrictEqual(
			getWorkflowJobPermissions(deployWorkflow, 'deploy'),
			{
				contents: 'read'
			}
		);
	});

	it('keeps the pre-push hook on the fast verification lane', () => {
		const hook = readFileSync(PRE_PUSH_HOOK_PATH, 'utf8');
		const hookInvocations = getNpmRunInvocations(hook);

		assert.ok(hookInvocations.includes('test:fast'));
		assert.ok(!hookInvocations.includes('test:full'));
	});

	it('defines the fast and full verification scripts from the canonical lanes', () => {
		const scripts = getPackageScripts();
		const fastInvocations = getNpmRunInvocations(scripts['test:fast']);
		const fullInvocations = getNpmRunInvocations(scripts['test:full']);

		assert.ok(getNpmRunInvocations(scripts['test:ci']).includes('test:fast'));
		assert.ok(
			getNpmRunInvocations(scripts['test:deploy']).includes('test:full')
		);
		assert.ok(fastInvocations.includes('lint'));
		assert.ok(fastInvocations.includes('test:core'));
		assert.ok(fullInvocations.includes('test:fast'));
	});

	it('keeps runtime auth secrets out of the image build job', () => {
		const workflow = readWorkflow(DEPLOY_WORKFLOW_PATH);
		const buildStep = findWorkflowStep(
			workflow,
			'build',
			(step) => step.uses?.startsWith('docker/build-push-action@') ?? false,
			'the image build step'
		);

		assert.strictEqual(buildStep.with.secrets, undefined);
		assert.strictEqual(buildStep.with['secret-envs'], undefined);
		assert.strictEqual(
			includesSensitiveSecretReference(getWorkflowJob(workflow, 'build')),
			false
		);
	});
});
