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
const DOCKERFILE_PATH = path.join(ROOT, 'Dockerfile');
const DEPLOYABLE_REF_CONDITION =
	"github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')";

function getWorkflowJobCondition(workflow, jobName) {
	const lines = workflow.split('\n');
	let insideJobs = false;
	let insideRequestedJob = false;

	for (const line of lines) {
		if (!insideJobs) {
			if (line.trim() === 'jobs:') {
				insideJobs = true;
			}
			continue;
		}

		if (/^[^\s]/.test(line)) {
			break;
		}

		const topLevelJobMatch = line.match(/^ {2}([a-z0-9_-]+):\s*$/i);
		if (topLevelJobMatch) {
			insideRequestedJob = topLevelJobMatch[1] === jobName;
			continue;
		}

		if (insideRequestedJob) {
			const ifMatch = line.match(/^ {4}if:\s*(.+)\s*$/);
			if (ifMatch) {
				return ifMatch[1];
			}
		}
	}

	throw new Error(`job ${jobName} is missing an if condition`);
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

describe('deployment runtime guardrails', () => {
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
			'/app/apps/hub/server.js -> ./apps/hub/server.js',
			'/app/node_modules -> ./node_modules',
			'/app/package-lock.json -> ./',
			'/app/package.json -> ./'
		]);
	});
});
