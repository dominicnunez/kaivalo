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

describe('deployment runtime guardrails', () => {
	it('only builds deploy images from deployable refs', () => {
		const workflow = readFileSync(DEPLOY_WORKFLOW_PATH, 'utf8');

		assert.match(
			workflow,
			new RegExp(`build:\\n(?:.+\\n)*?\\s+if: ${DEPLOYABLE_REF_CONDITION}`)
		);
		assert.match(
			workflow,
			new RegExp(`deploy:\\n(?:.+\\n)*?\\s+if: ${DEPLOYABLE_REF_CONDITION}`)
		);
	});

	it('copies only the runtime hub artifacts into the production image', () => {
		const dockerfile = readFileSync(DOCKERFILE_PATH, 'utf8');

		assert.match(
			dockerfile,
			/COPY --from=build --chown=node:node \/app\/apps\/hub\/build \.\/apps\/hub\/build/
		);
		assert.match(
			dockerfile,
			/COPY --from=build --chown=node:node \/app\/apps\/hub\/server\.js \.\/apps\/hub\/server\.js/
		);
		assert.match(
			dockerfile,
			/COPY --from=build --chown=node:node \/app\/apps\/hub\/src\/lib\/server \.\/apps\/hub\/src\/lib\/server/
		);
		assert.doesNotMatch(
			dockerfile,
			/COPY --from=build --chown=node:node \/app\/packages\/ui \.\/packages\/ui/
		);
		assert.doesNotMatch(
			dockerfile,
			/COPY --from=build --chown=node:node \/app\/apps\/hub \.\/apps\/hub/
		);
	});
});
