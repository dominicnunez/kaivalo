import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { getHubBuildEnv } from '../apps/hub/scripts/build-env.ts';
import { getDockerCopyInstructions } from './helpers/dockerfile.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEPLOY_WORKFLOW_PATH = path.join(
	ROOT,
	'.github',
	'workflows',
	'deploy.yml'
);
const CI_WORKFLOW_PATH = path.join(ROOT, '.github', 'workflows', 'ci.yml');
const DAILY_FULL_SUITE_WORKFLOW_PATH = path.join(
	ROOT,
	'.github',
	'workflows',
	'daily-full-suite.yml'
);
const DOCKERFILE_PATH = path.join(ROOT, 'Dockerfile');
const PRE_PUSH_HOOK_PATH = path.join(ROOT, '.husky', 'pre-push');
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json');
const DEPLOY_HEALTH_SCRIPT_PATH = path.join(
	ROOT,
	'scripts',
	'verify-deploy-health.sh'
);
const PRODUCTION_IMAGE_SMOKE_BUILD_SCRIPT_PATH = path.join(
	ROOT,
	'scripts',
	'build-production-image-smoke.sh'
);
const TRACK_SVELTEKIT_UPSTREAM_WORKFLOW_PATH = path.join(
	ROOT,
	'.github',
	'workflows',
	'track-sveltekit-upstream.yml'
);
const DEPLOYABLE_REF_CONDITION =
	"github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')";
const PINNED_NODE_VERSION_PATTERN = /^node:(\d+\.\d+\.\d+)-/;
const IMAGE_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/i;
const FULL_LENGTH_ACTION_REF_PATTERN =
	/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[a-f0-9]{40}$/;
const EXPECTED_WORKFLOW_TIMEOUTS = {
	ciVerify: 15,
	dailyVerify: 45,
	dailyDockerSmoke: 20,
	trackSvelteKitCheck: 10,
	deploy: 15
} as const;

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

function getWorkflowJobPermissions(workflow: WorkflowRecord, jobName: string) {
	return readStringRecord(
		getWorkflowJob(workflow, jobName).permissions,
		`job ${jobName} should define permissions`
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

function getRuntimeStageBuildCopies(dockerfile: string) {
	return getDockerCopyInstructions(dockerfile)
		.filter(({ stage, flags }) => stage === 'runtime' && flags.from === 'build')
		.flatMap(({ sources, destination }) =>
			sources.map((source) => ({
				source,
				destination
			}))
		);
}

function getDockerfileFromImages(dockerfile: string) {
	return dockerfile
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.startsWith('FROM '))
		.map((line) => {
			const match = line.match(/^FROM\s+(\S+)\s+AS\s+([a-z0-9_-]+)\s*$/i);
			assert.ok(
				match,
				`Dockerfile FROM line should declare a named stage: ${line}`
			);
			return {
				image: match[1],
				stage: match[2].toLowerCase()
			};
		});
}

function getPinnedNodeVersionFromDockerfile(dockerfile: string) {
	const [buildStage] = getDockerfileFromImages(dockerfile);
	assert.ok(buildStage, 'Dockerfile should define at least one FROM image');

	const match = buildStage.image.match(PINNED_NODE_VERSION_PATTERN);
	assert.ok(
		match,
		`Dockerfile build stage should use a pinned node image tag: ${buildStage.image}`
	);

	return match[1];
}

function parsePinnedNodeImage(image: string) {
	const [reference, digest] = image.split('@');
	assert.ok(
		reference,
		'Dockerfile stage should include an image reference before the digest'
	);
	assert.ok(
		digest && IMAGE_DIGEST_PATTERN.test(digest),
		`Dockerfile stage should use an immutable digest: ${image}`
	);

	const match = reference.match(PINNED_NODE_VERSION_PATTERN);
	assert.ok(
		match,
		`Dockerfile stage should use a pinned node image tag: ${reference}`
	);

	return {
		reference,
		digest,
		nodeVersion: match[1]
	};
}

function getPackageScripts() {
	const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
	assert.ok(packageJson.scripts, 'package.json should define scripts');
	return packageJson.scripts;
}

function getNpmRunInvocations(value: string): string[] {
	return Array.from(
		normalizeShellScript(value).matchAll(/\bnpm\s+run\s+([a-z0-9:-]+)/gi),
		(match) => match[1]
	);
}

function parseCronExpression(expression: string): string[] {
	const fields = expression.trim().split(/\s+/);
	assert.strictEqual(
		fields.length,
		5,
		`expected 5-field cron expression, received: ${expression}`
	);
	return fields;
}

function isDailyOrMoreFrequentSchedule(expression: string): boolean {
	const [, , dayOfMonth, month, dayOfWeek] = parseCronExpression(expression);
	return dayOfMonth === '*' && month === '*' && dayOfWeek === '*';
}

function parseSshOptions(script: string): Map<string, string> {
	return new Map(
		Array.from(
			normalizeShellScript(script).matchAll(
				/-o\s+([A-Za-z][A-Za-z0-9]+)=([^\s]+)/g
			),
			(match) => [match[1], match[2]]
		)
	);
}

describe('deployment runtime guardrails', () => {
	it('runs the fast verification lane on push and pull requests', () => {
		const workflow = readWorkflow(CI_WORKFLOW_PATH);
		const { triggers } = getWorkflowTriggers(workflow);
		const runCommands = getWorkflowRunCommands(workflow, 'verify');

		assert.ok(triggers.has('push'));
		assert.ok(triggers.has('pull_request'));
		assert.ok(runCommands.includes('npm ci --ignore-scripts'));
		assert.ok(runCommands.includes('npm run test:ci'));
		assert.strictEqual(
			runCommands.filter((command) => command === 'npm run lint').length,
			0,
			'fast lane CI should invoke the shared test:ci entrypoint without a duplicate lint step'
		);
		assert.strictEqual(
			getWorkflowJobTimeoutMinutes(workflow, 'verify'),
			EXPECTED_WORKFLOW_TIMEOUTS.ciVerify
		);
	});

	it('pins every workflow node setup step to the Docker runtime patch version', () => {
		const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
		const pinnedNodeVersion = getPinnedNodeVersionFromDockerfile(dockerfile);
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

	it('runs the full verification lane before deployment', () => {
		const workflow = readWorkflow(DEPLOY_WORKFLOW_PATH);
		const runCommands = getWorkflowRunCommands(workflow, 'test');

		assert.ok(runCommands.includes('npm ci --ignore-scripts'));
		assert.ok(runCommands.includes('npm run test:deploy'));
	});

	it('smoke tests the built production image before deployment', () => {
		const workflow = readWorkflow(DEPLOY_WORKFLOW_PATH);
		const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
		const pinnedNodeVersion = getPinnedNodeVersionFromDockerfile(dockerfile);
		const runCommands = getWorkflowRunCommands(workflow, 'smoke_test');
		const smokeSteps = getWorkflowSteps(workflow, 'smoke_test');
		const setupNodeIndex = smokeSteps.findIndex((step) =>
			step.uses?.startsWith('actions/setup-node@')
		);
		const smokeProbeStep = findWorkflowStep(
			workflow,
			'smoke_test',
			(step) =>
				normalizeShellScript(step.run ?? '').includes(
					'./scripts/build-production-image-smoke.sh'
				),
			'the smoke image probe step'
		);
		const loginStep = findWorkflowStep(
			workflow,
			'smoke_test',
			(step) => step.uses?.startsWith('docker/login-action@') ?? false,
			'the registry login step for smoke testing the built image'
		);
		const smokeProbeIndex = smokeSteps.findIndex((step) =>
			normalizeShellScript(step.run ?? '').includes(
				'./scripts/build-production-image-smoke.sh'
			)
		);
		const setupNodeStep =
			setupNodeIndex === -1 ? undefined : smokeSteps[setupNodeIndex];

		assert.deepStrictEqual(getWorkflowJobNeeds(workflow, 'build'), ['test']);
		assert.deepStrictEqual(getWorkflowJobNeeds(workflow, 'smoke_test'), [
			'build'
		]);
		assert.deepStrictEqual(getWorkflowJobNeeds(workflow, 'deploy'), [
			'smoke_test'
		]);
		assert.strictEqual(
			getWorkflowJobCondition(workflow, 'smoke_test'),
			DEPLOYABLE_REF_CONDITION
		);
		assert.deepStrictEqual(getWorkflowJobPermissions(workflow, 'smoke_test'), {
			contents: 'read',
			packages: 'read'
		});
		assert.ok(
			runCommands.includes('./scripts/build-production-image-smoke.sh')
		);
		assert.strictEqual(loginStep.with.registry, 'ghcr.io');
		assert.strictEqual(loginStep.with.username, '${{ github.actor }}');
		assert.strictEqual(loginStep.with.password, '${{ secrets.GITHUB_TOKEN }}');
		assert.ok(
			setupNodeIndex >= 0 && setupNodeIndex < smokeProbeIndex,
			'smoke test job should configure Node.js before running the shared smoke verifier'
		);
		assert.strictEqual(setupNodeStep?.with['node-version'], pinnedNodeVersion);
		assert.strictEqual(
			smokeProbeStep.env.PRODUCTION_IMAGE_SMOKE_SKIP_BUILD,
			'true'
		);
		assert.strictEqual(
			smokeProbeStep.env.PRODUCTION_IMAGE_SMOKE_TAG,
			'${{ needs.build.outputs.image_ref }}'
		);
		assert.strictEqual(
			smokeProbeStep.env.WORKOS_API_HOSTNAME,
			'${{ vars.WORKOS_API_HOSTNAME }}'
		);
		assert.ok(
			readFileSync(PRODUCTION_IMAGE_SMOKE_BUILD_SCRIPT_PATH, 'utf8').startsWith(
				'#!/usr/bin/env bash'
			),
			'production image smoke build should be implemented in the shared script'
		);
		assert.match(
			readFileSync(PRODUCTION_IMAGE_SMOKE_BUILD_SCRIPT_PATH, 'utf8'),
			/verify-deploy-health\.sh/,
			'production image smoke build should reuse the shared deploy health verification script'
		);
	});

	it('bounds deployment hangs and verifies application health after rollout', () => {
		const workflow = readWorkflow(DEPLOY_WORKFLOW_PATH);
		const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
		const pinnedNodeVersion = getPinnedNodeVersionFromDockerfile(dockerfile);
		const deploySteps = getWorkflowSteps(workflow, 'deploy');
		const isDeployHealthVerificationStep = (step: WorkflowStep) =>
			normalizeShellScript(step.run ?? '').includes(
				'./scripts/verify-deploy-health.sh'
			) &&
			step.env.DEPLOY_ORIGIN === '${{ vars.DEPLOY_ORIGIN }}' &&
			step.env.WORKOS_API_HOSTNAME === '${{ vars.WORKOS_API_HOSTNAME }}';
		const checkoutIndex = deploySteps.findIndex((step) =>
			step.uses?.startsWith('actions/checkout@')
		);
		const setupNodeIndex = deploySteps.findIndex((step) =>
			step.uses?.startsWith('actions/setup-node@')
		);
		const verifyIndex = deploySteps.findIndex(isDeployHealthVerificationStep);
		const setupNodeStep =
			setupNodeIndex === -1 ? undefined : deploySteps[setupNodeIndex];
		const deployStep = findWorkflowStep(
			workflow,
			'deploy',
			(step) => {
				const runCommand = normalizeShellScript(step.run ?? '');
				return runCommand.includes('ssh ') && runCommand.includes('deploy-app');
			},
			'the image deployment step'
		);
		assert.ok(
			verifyIndex >= 0,
			'deploy job should define a deployment health verification step'
		);
		const verifyStep = deploySteps[verifyIndex];
		const deployCommand = normalizeShellScript(deployStep.run ?? '');
		const verifyCommand = normalizeShellScript(verifyStep.run ?? '');
		const sshOptions = parseSshOptions(deployCommand);

		assert.strictEqual(
			getWorkflowJobTimeoutMinutes(workflow, 'deploy'),
			EXPECTED_WORKFLOW_TIMEOUTS.deploy
		);
		assert.ok(deployCommand.includes('ssh '));
		assert.strictEqual(sshOptions.get('BatchMode'), 'yes');
		assert.strictEqual(sshOptions.get('ConnectTimeout'), '10');
		assert.strictEqual(sshOptions.get('ServerAliveInterval'), '15');
		assert.strictEqual(sshOptions.get('ServerAliveCountMax'), '3');
		assert.strictEqual(
			deployStep.env.DEPLOY_SSH_KEY,
			'${{ secrets.DEPLOY_SSH_KEY }}'
		);
		assert.ok(
			deployCommand.includes('ssh-add - <<< "$DEPLOY_SSH_KEY"'),
			'deploy step should load the SSH key in the same step that executes the remote deploy'
		);
		assert.ok(
			checkoutIndex >= 0 && checkoutIndex < verifyIndex,
			'deploy job should check out the repository before verifying deployment health'
		);
		assert.ok(
			setupNodeIndex >= 0 && setupNodeIndex < verifyIndex,
			'deploy job should configure Node.js before verifying deployment health'
		);
		assert.strictEqual(setupNodeStep?.with['node-version'], pinnedNodeVersion);
		assert.ok(
			verifyCommand.includes('./scripts/verify-deploy-health.sh'),
			'deploy health verification should run the shared probe script'
		);
		assert.strictEqual(
			verifyStep.env.AUTH_ERROR_SIGNING_SECRET,
			undefined,
			'deploy health verification should not receive runtime auth signing secrets'
		);
		assert.strictEqual(
			verifyStep.env.AVATAR_PROXY_SIGNING_SECRET,
			undefined,
			'deploy health verification should not receive runtime avatar signing secrets'
		);
		assert.strictEqual(
			includesSensitiveSecretReference(verifyStep),
			false,
			'deploy health verification should stay free of runtime auth secret references'
		);
		assert.ok(
			readFileSync(DEPLOY_HEALTH_SCRIPT_PATH, 'utf8').startsWith(
				'#!/usr/bin/env bash'
			),
			'deploy health verification should be implemented in the shared script'
		);
	});

	it('runs the full verification lane on a daily schedule', () => {
		const workflow = readWorkflow(DAILY_FULL_SUITE_WORKFLOW_PATH);
		const { triggers, schedule } = getWorkflowTriggers(workflow);
		const permissions = getWorkflowPermissions(workflow);
		const runCommands = getWorkflowRunCommands(workflow, 'verify');

		assert.ok(triggers.has('workflow_dispatch'));
		assert.ok(
			schedule.some((cron) => isDailyOrMoreFrequentSchedule(cron)),
			'daily full suite should define at least one daily or more frequent schedule'
		);
		assert.strictEqual(permissions.contents, 'read');
		assert.ok(runCommands.includes('npm ci --ignore-scripts'));
		assert.ok(runCommands.includes('npm run test:full'));
		assert.strictEqual(
			getWorkflowJobTimeoutMinutes(workflow, 'verify'),
			EXPECTED_WORKFLOW_TIMEOUTS.dailyVerify
		);
	});

	it('smoke builds the production image on daily full-suite runs', () => {
		const workflow = readWorkflow(DAILY_FULL_SUITE_WORKFLOW_PATH);
		const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
		const pinnedNodeVersion = getPinnedNodeVersionFromDockerfile(dockerfile);
		const runCommands = getWorkflowRunCommands(workflow, 'docker_smoke');
		const smokeSteps = getWorkflowSteps(workflow, 'docker_smoke');
		const setupNodeIndex = smokeSteps.findIndex((step) =>
			step.uses?.startsWith('actions/setup-node@')
		);
		const smokeBuildIndex = smokeSteps.findIndex((step) =>
			normalizeShellScript(step.run ?? '').includes(
				'./scripts/build-production-image-smoke.sh'
			)
		);
		const setupNodeStep =
			setupNodeIndex === -1 ? undefined : smokeSteps[setupNodeIndex];

		assert.deepStrictEqual(getWorkflowJobNeeds(workflow, 'docker_smoke'), [
			'verify'
		]);
		assert.ok(
			runCommands.includes('./scripts/build-production-image-smoke.sh')
		);
		assert.ok(
			setupNodeIndex >= 0 && setupNodeIndex < smokeBuildIndex,
			'daily docker smoke job should configure Node.js before running the shared smoke verifier'
		);
		assert.strictEqual(setupNodeStep?.with['node-version'], pinnedNodeVersion);
		assert.strictEqual(
			getWorkflowJobTimeoutMinutes(workflow, 'docker_smoke'),
			EXPECTED_WORKFLOW_TIMEOUTS.dailyDockerSmoke
		);
	});

	it('bounds routine workflow jobs that can otherwise hang on platform defaults', () => {
		const trackWorkflow = readWorkflow(TRACK_SVELTEKIT_UPSTREAM_WORKFLOW_PATH);

		assert.strictEqual(
			getWorkflowJobTimeoutMinutes(trackWorkflow, 'check'),
			EXPECTED_WORKFLOW_TIMEOUTS.trackSvelteKitCheck
		);
	});

	it('closes stale sveltekit tracking issues once the repo catches up', () => {
		const workflow = readWorkflow(TRACK_SVELTEKIT_UPSTREAM_WORKFLOW_PATH);
		const closeIssueStep = findWorkflowStep(
			workflow,
			'check',
			(step) => step.name === 'Close resolved tracking issue',
			'a step that closes resolved upstream tracking issues'
		);

		assert.strictEqual(
			closeIssueStep.if,
			"steps.check.outputs.has_newer_upstream != 'true' && steps.find_issue.outputs.issue_number != ''"
		);
		assert.ok(
			closeIssueStep.uses?.startsWith('actions/github-script@'),
			'resolved upstream issue closure should use the shared github-script action'
		);
		assert.strictEqual(
			closeIssueStep.env.ISSUE_NUMBER,
			'${{ steps.find_issue.outputs.issue_number }}'
		);
		assert.match(
			closeIssueStep.with.script,
			/github\.rest\.issues\.createComment/
		);
		assert.match(closeIssueStep.with.script, /state:\s*'closed'/);
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
		assert.deepStrictEqual(
			getWorkflowJobPermissions(deployWorkflow, 'smoke_test'),
			{
				contents: 'read',
				packages: 'read'
			}
		);
		assert.deepStrictEqual(getWorkflowJobPermissions(deployWorkflow, 'build'), {
			contents: 'read',
			packages: 'write'
		});
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
		const coreInvocations = getNpmRunInvocations(scripts['test:core']);

		assert.match(scripts.lint, /\beslint\b/);
		assert.ok(fastInvocations.includes('lint'));
		assert.ok(fastInvocations.includes('test:core'));
		assert.ok(getNpmRunInvocations(scripts['test:ci']).includes('test:fast'));
		assert.ok(fullInvocations.includes('test:fast'));
		assert.ok(fullInvocations.includes('test:preview:hub'));
		assert.ok(
			getNpmRunInvocations(scripts['test:deploy']).includes('test:full')
		);
		assert.ok(!coreInvocations.includes('test:preview:hub'));
	});

	it('only builds and deploys from deployable refs', () => {
		const workflow = readWorkflow(DEPLOY_WORKFLOW_PATH);

		assert.strictEqual(
			getWorkflowJobCondition(workflow, 'build'),
			DEPLOYABLE_REF_CONDITION
		);
		assert.strictEqual(
			getWorkflowJobCondition(workflow, 'smoke_test'),
			DEPLOYABLE_REF_CONDITION
		);
		assert.strictEqual(
			getWorkflowJobCondition(workflow, 'deploy'),
			DEPLOYABLE_REF_CONDITION
		);
	});

	it('includes the minimum runtime artifact set without copying app source trees', () => {
		const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
		const runtimeSources = new Set(
			getRuntimeStageBuildCopies(dockerfile).map(({ source }) => source)
		);

		for (const requiredSource of [
			'/app/package.json',
			'/app/package-lock.json',
			'/app/node_modules',
			'/app/apps/hub/package.json',
			'/app/apps/hub/server.ts',
			'/app/apps/hub/build'
		]) {
			assert.ok(
				runtimeSources.has(requiredSource),
				`runtime image should copy ${requiredSource} from the build stage`
			);
		}

		for (const source of runtimeSources) {
			assert.ok(
				!source.startsWith('/app/apps/hub/src'),
				'runtime image should not copy hub source files'
			);
			assert.ok(
				!source.startsWith('/app/packages/'),
				'runtime image should not copy workspace source packages'
			);
		}
	});

	it('keeps workspace-only ui sources out of runtime packaging', () => {
		const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
		const hubPackage = JSON.parse(
			readFileSync(path.join(ROOT, 'apps', 'hub', 'package.json'), 'utf8')
		) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		const pruneIndex = dockerfile.indexOf('RUN npm prune --omit=dev');

		assert.ok(
			!('@kaivalo/ui' in (hubPackage.dependencies ?? {})),
			'hub runtime dependencies should not retain workspace-only ui sources'
		);
		assert.ok(
			hubPackage.devDependencies?.['@kaivalo/ui'],
			'hub build-time dependencies should keep the workspace ui package available'
		);
		assert.ok(
			pruneIndex >= 0,
			'build stage should prune development dependencies before runtime packaging'
		);
		assert.ok(
			!dockerfile.includes(
				'COPY scripts/materialize-runtime-workspace-deps.ts scripts/materialize-runtime-workspace-deps.ts'
			),
			'runtime packaging should not copy workspace dependency materialization scripts'
		);
		assert.ok(
			!dockerfile.includes(
				'RUN node scripts/materialize-runtime-workspace-deps.ts'
			),
			'runtime packaging should not rehydrate pruned workspace ui packages'
		);
	});

	it('pins both Docker stages to the same immutable node base image digest', () => {
		const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
		const fromImages = getDockerfileFromImages(dockerfile);

		assert.deepStrictEqual(
			fromImages.map(({ stage }) => stage),
			['build', 'runtime']
		);
		assert.strictEqual(fromImages[0].image, fromImages[1].image);

		const buildImage = parsePinnedNodeImage(fromImages[0].image);
		const runtimeImage = parsePinnedNodeImage(fromImages[1].image);
		assert.strictEqual(buildImage.reference, runtimeImage.reference);
		assert.strictEqual(buildImage.digest, runtimeImage.digest);
		assert.strictEqual(buildImage.nodeVersion, runtimeImage.nodeVersion);
	});

	it('declares an in-container health check against the loopback health endpoint', () => {
		const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');

		assert.ok(
			dockerfile.includes(
				'HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3'
			),
			'runtime image should define a bounded health check policy'
		);
		assert.ok(
			dockerfile.includes("const port = process.env.PORT ?? '3100';"),
			'runtime image health probe should stay aligned with the configured port'
		);
		assert.ok(
			dockerfile.includes("'http://127.0.0.1:' + port + '/healthz'"),
			'runtime image should probe the loopback health endpoint'
		);
		assert.ok(
			dockerfile.includes('if (!response.ok) process.exit(1);'),
			'runtime image health probe should fail when the app stops serving successful responses'
		);
		assert.ok(
			dockerfile.includes('.catch(() => process.exit(1))'),
			'runtime image health probe should exit non-zero on probe failure'
		);
	});

	it('uses the shared hub build env defaults for placeholder-safe image builds', () => {
		const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
		const buildEnv = getHubBuildEnv({ NODE_ENV: 'test' });

		assert.match(dockerfile, /\bRUN npm ci --ignore-scripts\b/);
		assert.match(
			dockerfile,
			/\bRUN HUB_BUILD_ALLOW_PLACEHOLDERS=true npm --prefix apps\/hub run build\b/
		);
		assert.doesNotMatch(dockerfile, /--mount=type=secret,id=workos_/);
		assert.doesNotMatch(dockerfile, /--mount=type=secret,id=auth_error_/);
		assert.doesNotMatch(dockerfile, /--mount=type=secret,id=avatar_proxy_/);
		assert.doesNotMatch(dockerfile, /--mount=type=secret,id=origin/);
		assert.ok(buildEnv.AUTH_ERROR_SIGNING_SECRET);
		assert.ok(buildEnv.AVATAR_PROXY_SIGNING_SECRET);
		assert.ok(buildEnv.WORKOS_COOKIE_PASSWORD);
		assert.strictEqual(
			buildEnv.WORKOS_REDIRECT_URI,
			'http://localhost:3100/auth/callback'
		);
		assert.strictEqual(buildEnv.ORIGIN, 'http://localhost:3100');
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
