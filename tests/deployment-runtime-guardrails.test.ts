import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { getHubBuildEnv } from '../apps/hub/scripts/build-env.ts';

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
const TRACK_SVELTEKIT_UPSTREAM_WORKFLOW_PATH = path.join(
	ROOT,
	'.github',
	'workflows',
	'track-sveltekit-upstream.yml'
);
const DEPLOYABLE_REF_CONDITION =
	"github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')";
const PINNED_NODE_VERSION_PATTERN = /^node:(\d+\.\d+\.\d+)-/;

type WorkflowRecord = Record<string, unknown>;

type WorkflowStep = {
	name?: string;
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

function normalizeWorkflowStep(
	step: unknown,
	description: string
): WorkflowStep {
	const record = readRecord(step, `${description} should be an object`);
	return {
		name: readOptionalString(record.name),
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
	return getWorkflowSteps(workflow, jobName).flatMap((step) =>
		step.run ? [step.run] : []
	);
}

function getWorkflowJobCondition(workflow: WorkflowRecord, jobName: string) {
	return readString(
		getWorkflowJob(workflow, jobName).if,
		`job ${jobName} is missing an if condition`
	);
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
		/\$\{\{\s*secrets\.(?:WORKOS_[A-Z0-9_]+|AUTH_ERROR_SIGNING_SECRET|ORIGIN)\s*\}\}/;
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

function getRuntimeStageBuildCopies(dockerfile) {
	const records = [];
	let currentStage = null;

	for (const rawLine of dockerfile.split('\n')) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) {
			continue;
		}

		const fromMatch = line.match(/^FROM\b.+\bAS\s+([a-z0-9_-]+)\s*$/i);
		if (fromMatch) {
			currentStage = fromMatch[1].toLowerCase();
			continue;
		}

		if (currentStage !== 'runtime' || !line.startsWith('COPY ')) {
			continue;
		}

		const tokens = line.split(/\s+/).slice(1);
		const flags = {};
		const args = [];

		for (const token of tokens) {
			if (token.startsWith('--')) {
				const [flag, value = ''] = token.slice(2).split('=');
				flags[flag] = value;
				continue;
			}
			args.push(token);
		}

		if (flags.from !== 'build') {
			continue;
		}

		const destination = args.at(-1);
		const sources = args.slice(0, -1);
		assert.ok(destination, 'runtime COPY entries should include a destination');
		assert.ok(
			sources.length > 0,
			'runtime COPY entries should include at least one source'
		);

		for (const source of sources) {
			records.push({
				source,
				destination
			});
		}
	}

	return records;
}

function getDockerfileFromImages(dockerfile) {
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

function getPinnedNodeVersionFromDockerfile(dockerfile) {
	const [buildStage] = getDockerfileFromImages(dockerfile);
	assert.ok(buildStage, 'Dockerfile should define at least one FROM image');

	const match = buildStage.image.match(PINNED_NODE_VERSION_PATTERN);
	assert.ok(
		match,
		`Dockerfile build stage should use a pinned node image tag: ${buildStage.image}`
	);

	return match[1];
}

function getPackageScripts() {
	const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
	assert.ok(packageJson.scripts, 'package.json should define scripts');
	return packageJson.scripts;
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

	it('runs the full verification lane before deployment', () => {
		const workflow = readWorkflow(DEPLOY_WORKFLOW_PATH);
		const runCommands = getWorkflowRunCommands(workflow, 'test');

		assert.ok(runCommands.includes('npm ci --ignore-scripts'));
		assert.ok(runCommands.includes('npm run test:deploy'));
	});

	it('bounds deployment hangs and verifies application health after rollout', () => {
		const workflow = readWorkflow(DEPLOY_WORKFLOW_PATH);
		const deployJob = getWorkflowJob(workflow, 'deploy');
		const deployStep = findWorkflowStep(
			workflow,
			'deploy',
			(step) => step.name === 'Deploy image',
			'the image deployment step'
		);
		const verifyStep = findWorkflowStep(
			workflow,
			'deploy',
			(step) => step.name === 'Verify deployment health',
			'the deployment health verification step'
		);

		assert.strictEqual(
			readNumber(
				deployJob['timeout-minutes'],
				'deploy job should define timeout-minutes'
			),
			15
		);
		assert.match(deployStep.run ?? '', /\bssh\b/);
		assert.match(deployStep.run ?? '', /-o BatchMode=yes/);
		assert.match(deployStep.run ?? '', /-o ConnectTimeout=10/);
		assert.match(deployStep.run ?? '', /-o ServerAliveInterval=15/);
		assert.match(deployStep.run ?? '', /-o ServerAliveCountMax=3/);
		assert.strictEqual(
			verifyStep.env.DEPLOY_ORIGIN,
			'${{ vars.DEPLOY_ORIGIN }}'
		);
		assert.match(verifyStep.run ?? '', /\/healthz/);
		assert.match(
			verifyStep.run ?? '',
			/Expected \/healthz to return plain-text ok/
		);
		assert.match(verifyStep.run ?? '', /\bcurl\b/);
	});

	it('runs the full verification lane on a daily schedule', () => {
		const workflow = readWorkflow(DAILY_FULL_SUITE_WORKFLOW_PATH);
		const { triggers, schedule } = getWorkflowTriggers(workflow);
		const permissions = getWorkflowPermissions(workflow);
		const setupNodeStep = findWorkflowStep(
			workflow,
			'verify',
			(step) => step.uses?.startsWith('actions/setup-node@') ?? false,
			'the Node.js setup step'
		);
		const runCommands = getWorkflowRunCommands(workflow, 'verify');

		assert.ok(triggers.has('workflow_dispatch'));
		assert.deepStrictEqual(schedule, ['0 14 * * *']);
		assert.strictEqual(permissions.contents, 'read');
		assert.strictEqual(setupNodeStep.with['node-version'], '24.14.0');
		assert.strictEqual(setupNodeStep.with.cache, 'npm');
		assert.ok(runCommands.includes('npm ci --ignore-scripts'));
		assert.ok(runCommands.includes('npm run test:full'));
	});

	it('keeps the pre-push hook on the fast verification lane', () => {
		const hook = readFileSync(PRE_PUSH_HOOK_PATH, 'utf8');

		assert.match(hook, /\bnpm run test:fast\b/);
		assert.doesNotMatch(hook, /\bnpm run test:full\b/);
	});

	it('defines the fast and full verification scripts from the canonical lanes', () => {
		const scripts = getPackageScripts();

		assert.match(scripts.lint, /\beslint\b/);
		assert.match(scripts['test:fast'], /\bnpm run lint\b/);
		assert.match(scripts['test:fast'], /\bnpm run test:core\b/);
		assert.match(scripts['test:full'], /\bnpm run test:fast\b/);
		assert.doesNotMatch(scripts['test:core'], /hub-preview-script\.test\.ts/);
		assert.match(scripts['test:full'], /\bnpm run test:preview:hub\b/);
	});

	it('only builds and deploys from deployable refs', () => {
		const workflow = readWorkflow(DEPLOY_WORKFLOW_PATH);

		assert.strictEqual(
			getWorkflowJobCondition(workflow, 'build'),
			DEPLOYABLE_REF_CONDITION
		);
		assert.strictEqual(
			getWorkflowJobCondition(workflow, 'deploy'),
			DEPLOYABLE_REF_CONDITION
		);
	});

	it('limits the runtime image to the declared hub runtime artifact set', () => {
		const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
		const runtimeCopies = getRuntimeStageBuildCopies(dockerfile).map(
			({ source, destination }) => `${source} -> ${destination}`
		);

		assert.deepStrictEqual(runtimeCopies.sort(), [
			'/app/apps/hub/build -> ./apps/hub/build',
			'/app/apps/hub/package.json -> ./apps/hub/package.json',
			'/app/apps/hub/server.ts -> ./apps/hub/server.ts',
			'/app/node_modules -> ./node_modules',
			'/app/package-lock.json -> ./',
			'/app/package.json -> ./'
		]);
	});

	it('pins both Docker stages to an immutable node base image digest', () => {
		const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');
		const fromImages = getDockerfileFromImages(dockerfile);

		assert.deepStrictEqual(
			fromImages.map(({ image, stage }) => ({ image, stage })),
			[
				{
					image:
						'node:24.14.0-bookworm-slim@sha256:b4687aef2571c632a1953695ce4d61d6462a7eda471fe6e272eebf0418f276ba',
					stage: 'build'
				},
				{
					image:
						'node:24.14.0-bookworm-slim@sha256:b4687aef2571c632a1953695ce4d61d6462a7eda471fe6e272eebf0418f276ba',
					stage: 'runtime'
				}
			]
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
		assert.doesNotMatch(dockerfile, /--mount=type=secret,id=origin/);
		assert.ok(buildEnv.AUTH_ERROR_SIGNING_SECRET);
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
			(step) => step.name === 'Build and push image',
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
