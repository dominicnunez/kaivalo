import { describe, it } from 'node:test';
import assert from 'node:assert';
import { httpGet, startHubPreview } from './helpers/hub-preview.js';

describe('WorkOS AuthKit Installation', () => {
  it('preview renders an unauthenticated auth entrypoint with fixture WorkOS configuration', async () => {
    const preview = await startHubPreview();
    try {
      const homepage = await httpGet(preview.baseUrl);
      assert.strictEqual(homepage.statusCode, 200, 'preview should respond successfully');
      assert.match(homepage.data, /https:\/\/api\.workos\.com\/user_management\/authorize\?/);
      assert.ok(!homepage.data.includes('action="/auth/sign-out"'));
    } finally {
      await preview.stop();
    }
  });
});
