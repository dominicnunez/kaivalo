import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { httpGet, startHubPreview } from './helpers/hub-preview.js';

const currentYear = String(new Date().getFullYear());

let preview;
let homepage;
let dom;
let document;

describe('apps/hub footer section', () => {
  before(async () => {
    preview = await startHubPreview();
    homepage = await httpGet(preview.baseUrl);
    dom = new JSDOM(homepage.data);
    document = dom.window.document;
  });

  after(async () => {
    dom?.window.close();
    await preview?.stop();
  });

  it('renders footer with copyright year', () => {
    const footer = document.querySelector('footer');
    assert.ok(footer, 'Footer should be present');
    assert.ok(footer.textContent?.includes(currentYear), 'Footer should include current year');
  });

  it('renders footer navigation links', () => {
    const footer = document.querySelector('footer');
    assert.ok(footer, 'Footer should be present');

    const hrefs = Array.from(footer.querySelectorAll('a[href]')).map((anchor) => anchor.getAttribute('href') ?? '');
    assert.ok(hrefs.length > 0, 'Footer should include at least one link');
    assert.strictEqual(hrefs.filter((href) => href.trim() === '').length, 0, 'Footer links should not be empty');
  });
});
