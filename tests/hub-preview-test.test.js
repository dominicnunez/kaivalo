import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { httpGet, startHubPreview } from './helpers/hub-preview.js';

describe('npm run preview smoke', () => {
  let preview;
  let homepage;
  let dom;
  let document;

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

  it('boots preview and renders homepage route with auth controls', () => {
    assert.strictEqual(homepage.statusCode, 200, 'Should return 200 OK');
    assert.ok(document.doctype, 'Response should contain doctype');
    const pageTitle = document.querySelector('title')?.textContent?.trim() ?? '';
    assert.notStrictEqual(pageTitle, '', 'Page should render a non-empty title');
    assert.ok(document.querySelector('main'), 'Page should render a main landmark');
    assert.ok(document.getElementById('services'), 'Services section should be present');
    assert.ok(document.getElementById('about'), 'About section should be present');
    assert.ok(document.querySelector('footer'), 'Page should render a footer landmark');

    const signOutForm = document.querySelector('form[action="/auth/sign-out"][method="POST"]');
    const authLinks = Array.from(document.querySelectorAll('a[href]')).map((anchor) => anchor.getAttribute('href') ?? '');
    const hasSignInLink = authLinks.some((href) => href.includes('/auth/sign-in') || href.includes('/user_management/authorize'));
    assert.ok(signOutForm || hasSignInLink, 'Page should expose auth entry/exit controls');
  });

  it('wires static asset routes for runtime startup', async () => {
    const faviconRes = await httpGet(`${preview.baseUrl}/favicon.ico`);
    assert.strictEqual(faviconRes.statusCode, 200, 'favicon should return 200');
  });
});
