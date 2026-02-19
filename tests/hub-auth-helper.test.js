import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const authPath = join(projectRoot, 'apps/hub/src/lib/auth.ts');
const authContent = readFileSync(authPath, 'utf-8');

describe('src/lib/auth.ts — route protection helper', () => {
	test('file exists', () => {
		assert.ok(existsSync(authPath));
	});

	test('imports authKit from @workos/authkit-sveltekit', () => {
		assert.ok(authContent.includes("from '@workos/authkit-sveltekit'"));
	});

	test('imports redirect from @sveltejs/kit', () => {
		assert.ok(authContent.includes("import { redirect } from '@sveltejs/kit'"));
	});

	test('imports RequestEvent type from @sveltejs/kit', () => {
		assert.ok(authContent.includes("import type { RequestEvent } from '@sveltejs/kit'"));
	});

	test('exports requireAuth function', () => {
		assert.ok(authContent.includes('export async function requireAuth'));
	});

	test('requireAuth accepts a RequestEvent parameter', () => {
		assert.match(authContent, /requireAuth\(event:\s*RequestEvent\)/);
	});

	test('calls authKit.getUser to check authentication', () => {
		assert.ok(authContent.includes('authKit.getUser(event)'));
	});

	test('redirects unauthenticated users with redirect(302, ...)', () => {
		assert.ok(authContent.includes('redirect(302,'));
	});

	test('generates sign-in URL with returnTo for post-auth redirect', () => {
		assert.ok(authContent.includes('returnTo'));
		assert.ok(authContent.includes('event.url.pathname'));
	});

	test('returns the user when authenticated', () => {
		assert.ok(authContent.includes('return user'));
	});

	test('re-exports authKit for convenience', () => {
		assert.match(authContent, /export\s*\{\s*authKit\s*\}\s*from\s*'@workos\/authkit-sveltekit'/);
	});

	test('does not hardcode any credentials or secrets', () => {
		assert.ok(!authContent.includes('client_'));
		assert.ok(!authContent.includes('sk_'));
		assert.ok(!authContent.includes('password'));
	});

	test('includes usage documentation in comments', () => {
		assert.ok(authContent.includes('+page.server.ts'));
		assert.ok(authContent.includes("from '$lib/auth'"));
	});
});

describe('build verification — auth helper does not break build', () => {
	test('npm run build succeeds', () => {
		execSync('npm run build', {
			cwd: join(projectRoot, 'apps/hub'),
			timeout: 60000,
			env: {
				...process.env,
				WORKOS_CLIENT_ID: 'client_test',
				WORKOS_API_KEY: 'sk_test_key',
				WORKOS_REDIRECT_URI: 'http://localhost:3100/auth/callback',
				WORKOS_COOKIE_PASSWORD: 'a'.repeat(32),
			},
		});
		assert.ok(existsSync(join(projectRoot, 'apps/hub/build/index.js')), 'build should produce index.js');
	});
});
