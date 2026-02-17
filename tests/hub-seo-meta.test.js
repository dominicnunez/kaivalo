import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.join(import.meta.dirname, '..');
const pageTs = path.join(projectRoot, 'apps/hub/src/routes/+page.ts');
const pageSvelte = path.join(projectRoot, 'apps/hub/src/routes/+page.svelte');

let passed = 0;
let failed = 0;

function test(name, fn) {
	try {
		fn();
		console.log(`✓ ${name}`);
		passed++;
	} catch (err) {
		console.log(`✗ ${name}`);
		console.log(`  ${err.message}`);
		failed++;
	}
}

// +page.ts tests
test('+page.ts file exists', () => {
	assert.ok(fs.existsSync(pageTs), '+page.ts should exist');
});

const pageTsContent = fs.existsSync(pageTs) ? fs.readFileSync(pageTs, 'utf-8') : '';

test('+page.ts imports PageLoad type', () => {
	assert.ok(pageTsContent.includes("import type { PageLoad }"), '+page.ts should import PageLoad type');
});

test('+page.ts exports load function', () => {
	assert.ok(pageTsContent.includes('export const load'), '+page.ts should export load function');
});

test('+page.ts load function has PageLoad type', () => {
	assert.ok(pageTsContent.includes(': PageLoad'), 'load function should have PageLoad type annotation');
});

test('+page.ts returns meta object', () => {
	assert.ok(pageTsContent.includes('return {') && pageTsContent.includes('meta:'), '+page.ts should return meta object');
});

test('+page.ts has title in meta', () => {
	assert.ok(pageTsContent.includes("title:") && pageTsContent.includes('Kai Valo'), 'meta should have title with Kai Valo');
});

test('+page.ts has description in meta', () => {
	assert.ok(pageTsContent.includes('description:'), 'meta should have description');
});

test('+page.ts has url in meta', () => {
	assert.ok(pageTsContent.includes("url: 'https://kaivalo.com'"), 'meta should have url');
});

test('+page.ts has image in meta', () => {
	assert.ok(pageTsContent.includes("image: 'https://kaivalo.com/og-image.png'"), 'meta should have og-image url');
});

test('+page.ts has twitterCard in meta', () => {
	assert.ok(pageTsContent.includes("twitterCard: 'summary_large_image'"), 'meta should have twitterCard');
});

// +page.svelte tests
const pageSvelteContent = fs.existsSync(pageSvelte) ? fs.readFileSync(pageSvelte, 'utf-8') : '';

test('+page.svelte imports PageData type', () => {
	assert.ok(pageSvelteContent.includes("import type { PageData }"), '+page.svelte should import PageData type');
});

test('+page.svelte uses data prop', () => {
	assert.ok(pageSvelteContent.includes('let { data }'), '+page.svelte should destructure data prop');
});

test('+page.svelte has svelte:head element', () => {
	assert.ok(pageSvelteContent.includes('<svelte:head>'), '+page.svelte should have svelte:head');
});

test('+page.svelte closes svelte:head element', () => {
	assert.ok(pageSvelteContent.includes('</svelte:head>'), '+page.svelte should close svelte:head');
});

test('+page.svelte has title tag', () => {
	assert.ok(pageSvelteContent.includes('<title>'), '+page.svelte should have title tag');
});

test('+page.svelte uses data.meta.title', () => {
	assert.ok(pageSvelteContent.includes('data.meta.title'), '+page.svelte should use data.meta.title');
});

test('+page.svelte has description meta tag', () => {
	assert.ok(pageSvelteContent.includes('name="description"'), '+page.svelte should have description meta tag');
});

test('+page.svelte uses data.meta.description', () => {
	assert.ok(pageSvelteContent.includes('data.meta.description'), '+page.svelte should use data.meta.description');
});

// OG tags tests
test('+page.svelte has og:type meta tag', () => {
	assert.ok(pageSvelteContent.includes('property="og:type"'), '+page.svelte should have og:type meta tag');
});

test('+page.svelte has og:url meta tag', () => {
	assert.ok(pageSvelteContent.includes('property="og:url"'), '+page.svelte should have og:url meta tag');
});

test('+page.svelte has og:title meta tag', () => {
	assert.ok(pageSvelteContent.includes('property="og:title"'), '+page.svelte should have og:title meta tag');
});

test('+page.svelte has og:description meta tag', () => {
	assert.ok(pageSvelteContent.includes('property="og:description"'), '+page.svelte should have og:description meta tag');
});

test('+page.svelte has og:image meta tag', () => {
	assert.ok(pageSvelteContent.includes('property="og:image"'), '+page.svelte should have og:image meta tag');
});

test('+page.svelte has og:image:alt meta tag', () => {
	assert.ok(pageSvelteContent.includes('property="og:image:alt"'), '+page.svelte should have og:image:alt meta tag');
});

// Twitter card tests
test('+page.svelte has twitter:card meta tag', () => {
	assert.ok(pageSvelteContent.includes('name="twitter:card"'), '+page.svelte should have twitter:card meta tag');
});

// twitter:url is optional - twitter uses og:url as fallback

test('+page.svelte has twitter:title meta tag', () => {
	assert.ok(pageSvelteContent.includes('name="twitter:title"'), '+page.svelte should have twitter:title meta tag');
});

test('+page.svelte has twitter:description meta tag', () => {
	assert.ok(pageSvelteContent.includes('name="twitter:description"'), '+page.svelte should have twitter:description meta tag');
});

test('+page.svelte has twitter:image meta tag', () => {
	assert.ok(pageSvelteContent.includes('name="twitter:image"'), '+page.svelte should have twitter:image meta tag');
});

// twitter:image:alt is optional - twitter uses og:image:alt as fallback

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
