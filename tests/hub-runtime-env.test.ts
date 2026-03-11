import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	createHubBuiltRuntimeEnv,
	createHubPreviewEnv,
	createHubPreviewScriptEnv,
	sanitizeHubRuntimeEnv
} from './helpers/hub-runtime-env.ts';

describe('hub runtime env helpers', () => {
	it('scrub forwarded-client proxy settings from inherited envs', () => {
		const inheritedEnv = {
			ADDRESS_HEADER: 'x-forwarded-for',
			XFF_DEPTH: '1',
			KEEP_ME: 'present'
		};

		assert.deepStrictEqual(sanitizeHubRuntimeEnv(inheritedEnv), {
			KEEP_ME: 'present'
		});

		const previewEnv = createHubPreviewEnv({
			baseEnv: inheritedEnv,
			port: 4173
		});
		assert.strictEqual(previewEnv.ADDRESS_HEADER, undefined);
		assert.strictEqual(previewEnv.XFF_DEPTH, undefined);
		assert.strictEqual(previewEnv.KEEP_ME, 'present');

		const builtEnv = createHubBuiltRuntimeEnv({
			baseEnv: inheritedEnv,
			port: 4173
		});
		assert.strictEqual(builtEnv.ADDRESS_HEADER, undefined);
		assert.strictEqual(builtEnv.XFF_DEPTH, undefined);
		assert.strictEqual(builtEnv.KEEP_ME, 'present');
	});

	it('allows preview script envs to opt into a non-production node environment', () => {
		const previewScriptEnv = createHubPreviewScriptEnv({
			port: 4173,
			nodeEnv: 'development'
		});

		assert.strictEqual(previewScriptEnv.NODE_ENV, 'development');
		assert.strictEqual(previewScriptEnv.HOST, '127.0.0.1');
		assert.strictEqual(previewScriptEnv.PORT, '4173');
	});
});
