import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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
const DEPLOYABLE_REF_CONDITION =
	"github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')";

function getIndentedSection(lines, sectionName, indentSize = 0) {
	const prefix = ' '.repeat(indentSize);
	const sectionHeader = `${prefix}${sectionName}:`;
	const startIndex = lines.findIndex((line) => line === sectionHeader);
	assert.notStrictEqual(startIndex, -1, `${sectionName} section should exist`);

	const sectionLines = [];
	for (const line of lines.slice(startIndex + 1)) {
		if (line.length === 0) {
			sectionLines.push(line);
			continue;
		}

		const lineIndent = line.match(/^ */)?.[0].length ?? 0;
		if (lineIndent <= indentSize) {
			break;
		}

		sectionLines.push(line);
	}

	return sectionLines;
}

function getWorkflowTriggers(workflow) {
	const lines = workflow.split('\n');
	const triggerLines = getIndentedSection(lines, 'on');
	const triggers = new Set();
	const schedule = [];

	for (const line of triggerLines) {
		const triggerMatch = line.match(/^ {2}([a-z_]+):\s*$/);
		if (triggerMatch) {
			triggers.add(triggerMatch[1]);
			continue;
		}

		const cronMatch = line.match(/^ {4}- cron: ['"](.+)['"]$/);
		if (cronMatch) {
			schedule.push(cronMatch[1]);
		}
	}

	return { triggers, schedule };
}

function getWorkflowPermissions(workflow) {
	const lines = workflow.split('\n');
	const permissionLines = getIndentedSection(lines, 'permissions');
	const permissions = new Map();

	for (const line of permissionLines) {
		const match = line.match(/^ {2}([a-z-]+):\s*(.+)$/);
		if (match) {
			permissions.set(match[1], match[2]);
		}
	}

	return permissions;
}

function getWorkflowJobBlock(workflow, jobName) {
	const lines = workflow.split('\n');
	const jobsLines = getIndentedSection(lines, 'jobs');
	const jobHeader = `  ${jobName}:`;
	const startIndex = jobsLines.findIndex((line) => line === jobHeader);
	assert.notStrictEqual(startIndex, -1, `job ${jobName} should exist`);

	const jobLines = [];
	for (const line of jobsLines.slice(startIndex + 1)) {
		if (line.length === 0) {
			jobLines.push(line);
			continue;
		}

		const lineIndent = line.match(/^ */)?.[0].length ?? 0;
		if (lineIndent <= 2) {
			break;
		}

		jobLines.push(line);
	}

	return jobLines;
}

function getWorkflowJobCondition(workflow, jobName) {
	for (const line of getWorkflowJobBlock(workflow, jobName)) {
		const ifMatch = line.match(/^ {4}if:\s*(.+)\s*$/);
		if (ifMatch) {
			return ifMatch[1];
		}
	}

	throw new Error(`job ${jobName} is missing an if condition`);
}

function parseStepProperty(line) {
	const propertyMatch = line.match(/^(?: {6}- | {8})([a-z-]+):\s*(.*)$/);
	if (!propertyMatch) {
		return null;
	}

	return {
		name: propertyMatch[1],
		value: propertyMatch[2]
	};
}

function parseWithProperty(line) {
	const propertyMatch = line.match(/^ {10}([a-z-]+):\s*(.+)$/);
	if (!propertyMatch) {
		return null;
	}

	return {
		name: propertyMatch[1],
		value: propertyMatch[2]
	};
}

function getWorkflowSteps(workflow, jobName) {
	const jobLines = getWorkflowJobBlock(workflow, jobName);
	const steps = [];
	let currentStep = null;
	let insideWith = false;

	for (const line of jobLines) {
		if (line === '    steps:') {
			continue;
		}

		if (line.startsWith('      - ')) {
			if (currentStep) {
				steps.push(currentStep);
			}

			currentStep = { with: {} };
			insideWith = false;

			const property = parseStepProperty(line);
			if (property) {
				currentStep[property.name] = property.value;
			}
			continue;
		}

		if (!currentStep) {
			continue;
		}

		if (line === '        with:') {
			insideWith = true;
			continue;
		}

		if (insideWith) {
			const withProperty = parseWithProperty(line);
			if (withProperty) {
				currentStep.with[withProperty.name] = withProperty.value;
				continue;
			}

			if (!line.startsWith('          ')) {
				insideWith = false;
			}
		}

		if (!insideWith) {
			const property = parseStepProperty(line);
			if (property) {
				currentStep[property.name] = property.value;
			}
		}
	}

	if (currentStep) {
		steps.push(currentStep);
	}

	return steps;
}

function getWorkflowRunCommands(workflow, jobName) {
	return getWorkflowSteps(workflow, jobName)
		.map((step) => step.run)
		.filter((run) => typeof run === 'string');
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

function getPackageScripts() {
	const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
	assert.ok(packageJson.scripts, 'package.json should define scripts');
	return packageJson.scripts;
}

describe('deployment runtime guardrails', () => {
	it('runs the fast verification lane on push and pull requests', () => {
		const workflow = readFileSync(CI_WORKFLOW_PATH, 'utf8');
		const { triggers } = getWorkflowTriggers(workflow);
		const runCommands = getWorkflowRunCommands(workflow, 'verify');

		assert.ok(triggers.has('push'));
		assert.ok(triggers.has('pull_request'));
		assert.ok(runCommands.includes('npm run test:ci'));
		assert.strictEqual(
			runCommands.filter((command) => command === 'npm run lint').length,
			0,
			'fast lane CI should invoke the shared test:ci entrypoint without a duplicate lint step'
		);
	});

	it('runs the full verification lane before deployment', () => {
		const workflow = readFileSync(DEPLOY_WORKFLOW_PATH, 'utf8');
		const runCommands = getWorkflowRunCommands(workflow, 'test');

		assert.ok(runCommands.includes('npm run test:deploy'));
	});

	it('runs the full verification lane on a daily schedule', () => {
		const workflow = readFileSync(DAILY_FULL_SUITE_WORKFLOW_PATH, 'utf8');
		const { triggers, schedule } = getWorkflowTriggers(workflow);
		const permissions = getWorkflowPermissions(workflow);
		const setupNodeStep = getWorkflowSteps(workflow, 'verify').find((step) =>
			step.uses?.startsWith('actions/setup-node@')
		);
		const runCommands = getWorkflowRunCommands(workflow, 'verify');

		assert.ok(triggers.has('workflow_dispatch'));
		assert.deepStrictEqual(schedule, ['0 14 * * *']);
		assert.strictEqual(permissions.get('contents'), 'read');
		assert.ok(setupNodeStep, 'verify job should set up Node.js');
		assert.strictEqual(setupNodeStep.with['node-version'], '24');
		assert.strictEqual(setupNodeStep.with.cache, 'npm');
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
	});

	it('only builds and deploys from deployable refs', () => {
		const workflow = readFileSync(DEPLOY_WORKFLOW_PATH, 'utf8');

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
});
