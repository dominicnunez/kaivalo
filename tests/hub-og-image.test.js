import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import { getHomeMeta } from '../apps/hub/src/lib/seo/home-meta.js';
import { httpGet, startHubPreview } from './helpers/hub-preview.js';

describe('hub og image', () => {
  let preview;
  let homepage;
  let ogImageResponse;

  before(async () => {
    preview = await startHubPreview();
    homepage = await httpGet(preview.baseUrl);
    ogImageResponse = await httpGet(`${preview.baseUrl}/og-image.png`);
  });

  after(async () => {
    await preview?.stop();
  });

  it('serves og-image.png as a non-empty png asset', () => {
    assert.strictEqual(ogImageResponse.statusCode, 200);
    assert.match(String(ogImageResponse.headers['content-type'] ?? ''), /^image\/png/);
    assert.ok(Number(ogImageResponse.headers['content-length'] ?? 0) > 0);
  });

  it('keeps og-image payload in social-preview size budget', () => {
    const contentLength = Number(ogImageResponse.headers['content-length'] ?? 0);
    assert.ok(contentLength > 0 && contentLength < 500000, `OG image should be <500KB, got ${contentLength} bytes`);
  });

  it('renders metadata that points to the served og image URL', () => {
    const meta = getHomeMeta();
    assert.ok(meta.image.endsWith('/og-image.png'), 'metadata image URL should reference og-image.png');
    assert.ok(homepage.data.includes(`content="${meta.image}"`), 'rendered meta tags should include the canonical OG image URL');
  });
});
