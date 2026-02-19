import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.join(import.meta.dirname, '..');
const pageTs = path.join(projectRoot, 'apps/hub/src/routes/+page.ts');
const pageSvelte = path.join(projectRoot, 'apps/hub/src/routes/+page.svelte');
const pageTsContent = fs.existsSync(pageTs) ? fs.readFileSync(pageTs, 'utf-8') : '';
const pageSvelteContent = fs.existsSync(pageSvelte) ? fs.readFileSync(pageSvelte, 'utf-8') : '';
// +page.ts tests

describe('hub seo meta', () => {
  it('+page.ts file exists', () => {
    assert.ok(fs.existsSync(pageTs), '+page.ts should exist');
  });

  it('+page.ts imports PageLoad type', () => {
    assert.ok(pageTsContent.includes("import type { PageLoad }"), '+page.ts should import PageLoad type');
  });

  it('+page.ts exports load function', () => {
    assert.ok(pageTsContent.includes('export const load'), '+page.ts should export load function');
  });

  it('+page.ts load function has PageLoad type', () => {
    assert.ok(pageTsContent.includes(': PageLoad'), 'load function should have PageLoad type annotation');
  });

  it('+page.ts has title in meta', () => {
    assert.ok(pageTsContent.includes("title:") && pageTsContent.includes('Kai Valo'), 'meta should have title with Kai Valo');
  });

  it('+page.ts has description in meta', () => {
    assert.ok(pageTsContent.includes('description:'), 'meta should have description');
  });

  it('+page.ts has url in meta', () => {
    assert.ok(pageTsContent.includes("url: 'https://kaivalo.com'"), 'meta should have url');
  });

  it('+page.ts has image in meta', () => {
    assert.ok(pageTsContent.includes("image: 'https://kaivalo.com/og-image.png'"), 'meta should have og-image url');
  });

  it('+page.ts has twitterCard in meta', () => {
    assert.ok(pageTsContent.includes("twitterCard: 'summary_large_image'"), 'meta should have twitterCard');
  });

  it('+page.svelte imports PageData type', () => {
    assert.ok(pageSvelteContent.includes("import type { PageData }"), '+page.svelte should import PageData type');
  });

  it('+page.svelte uses data prop', () => {
    assert.ok(pageSvelteContent.includes('let { data }'), '+page.svelte should destructure data prop');
  });

  it('+page.svelte has svelte:head element', () => {
    assert.ok(pageSvelteContent.includes('<svelte:head>'), '+page.svelte should have svelte:head');
  });

  it('+page.svelte closes svelte:head element', () => {
    assert.ok(pageSvelteContent.includes('</svelte:head>'), '+page.svelte should close svelte:head');
  });

  it('+page.svelte has title tag', () => {
    assert.ok(pageSvelteContent.includes('<title>'), '+page.svelte should have title tag');
  });

  it('+page.svelte uses data.meta.title', () => {
    assert.ok(pageSvelteContent.includes('data.meta.title'), '+page.svelte should use data.meta.title');
  });

  it('+page.svelte has description meta tag', () => {
    assert.ok(pageSvelteContent.includes('name="description"'), '+page.svelte should have description meta tag');
  });

  it('+page.svelte uses data.meta.description', () => {
    assert.ok(pageSvelteContent.includes('data.meta.description'), '+page.svelte should use data.meta.description');
  });

  it('+page.svelte has og:type meta tag', () => {
    assert.ok(pageSvelteContent.includes('property="og:type"'), '+page.svelte should have og:type meta tag');
  });

  it('+page.svelte has og:url meta tag', () => {
    assert.ok(pageSvelteContent.includes('property="og:url"'), '+page.svelte should have og:url meta tag');
  });

  it('+page.svelte has og:title meta tag', () => {
    assert.ok(pageSvelteContent.includes('property="og:title"'), '+page.svelte should have og:title meta tag');
  });

  it('+page.svelte has og:description meta tag', () => {
    assert.ok(pageSvelteContent.includes('property="og:description"'), '+page.svelte should have og:description meta tag');
  });

  it('+page.svelte has og:image meta tag', () => {
    assert.ok(pageSvelteContent.includes('property="og:image"'), '+page.svelte should have og:image meta tag');
  });

  it('+page.svelte has og:image:alt meta tag', () => {
    assert.ok(pageSvelteContent.includes('property="og:image:alt"'), '+page.svelte should have og:image:alt meta tag');
  });

  it('+page.svelte has twitter:card meta tag', () => {
    assert.ok(pageSvelteContent.includes('name="twitter:card"'), '+page.svelte should have twitter:card meta tag');
  });

  it('+page.svelte has twitter:title meta tag', () => {
    assert.ok(pageSvelteContent.includes('name="twitter:title"'), '+page.svelte should have twitter:title meta tag');
  });

  it('+page.svelte has twitter:description meta tag', () => {
    assert.ok(pageSvelteContent.includes('name="twitter:description"'), '+page.svelte should have twitter:description meta tag');
  });

  it('+page.svelte has twitter:image meta tag', () => {
    assert.ok(pageSvelteContent.includes('name="twitter:image"'), '+page.svelte should have twitter:image meta tag');
  });
});
