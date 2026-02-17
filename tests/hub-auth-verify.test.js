import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const ROOT = '/home/kai/pets/kaivalo';
const HUB_DIR = join(ROOT, 'apps/hub');
const BUILD_DIR = join(HUB_DIR, 'build');
const SRC_DIR = join(HUB_DIR, 'src');

let passed = 0;
let failed = 0;

function test(name, fn) {
	try {
		fn();
		console.log(`  ✓ ${name}`);
		passed++;
	} catch (error) {
		console.log(`  ✗ ${name}`);
		console.log(`    ${error.message}`);
		failed++;
	}
}

console.log('Testing: WorkOS auth verification (build + e2e flow)');

// === Build verification ===
console.log('\n  Build verification:');

test('npm run build succeeds with auth code', () => {
	const result = execSync('npm run build 2>&1', {
		cwd: HUB_DIR,
		timeout: 180000,
		encoding: 'utf8'
	});
	assert.ok(result.includes('done'), 'Build should complete with "done" message');
	assert.ok(!result.includes('error during build'), 'Build should not have errors');
});

test('build output includes hooks.server entry', () => {
	const serverDir = join(BUILD_DIR, 'server');
	const allFiles = execSync(`find ${serverDir} -name "*.js" -type f`, { encoding: 'utf8' });
	assert.ok(allFiles.includes('hooks.server'), 'Build should include hooks.server entry');
});

test('build manifest includes auth callback route', () => {
	const manifest = readFileSync(join(BUILD_DIR, 'server/manifest.js'), 'utf8');
	assert.ok(manifest.includes('/auth/callback'), 'Manifest should include /auth/callback route');
});

test('build manifest includes auth sign-out route', () => {
	const manifest = readFileSync(join(BUILD_DIR, 'server/manifest.js'), 'utf8');
	assert.ok(manifest.includes('/auth/sign-out'), 'Manifest should include /auth/sign-out route');
});

test('build includes layout server chunk', () => {
	const serverFiles = execSync(`find ${join(BUILD_DIR, 'server')} -name "*.js" -type f`, { encoding: 'utf8' });
	assert.ok(serverFiles.includes('_layout.svelte'), 'Build should include layout chunk');
});

test('build has client assets', () => {
	const clientDir = join(BUILD_DIR, 'client/_app/immutable');
	assert.ok(existsSync(clientDir), 'Client immutable assets should exist');
});

// === Source verification ===
console.log('\n  Source code auth integration:');

test('hooks.server.ts configures WorkOS AuthKit', () => {
	const hooks = readFileSync(join(SRC_DIR, 'hooks.server.ts'), 'utf8');
	assert.ok(hooks.includes('configureAuthKit'), 'Should call configureAuthKit');
	assert.ok(hooks.includes('authKitHandle'), 'Should export authKitHandle');
	assert.ok(hooks.includes('WORKOS_CLIENT_ID'), 'Should pass client ID');
	assert.ok(hooks.includes('WORKOS_API_KEY'), 'Should pass API key');
	assert.ok(hooks.includes('WORKOS_REDIRECT_URI'), 'Should pass redirect URI');
	assert.ok(hooks.includes('WORKOS_COOKIE_PASSWORD'), 'Should pass cookie password');
});

test('callback route handles OAuth redirect', () => {
	const callback = readFileSync(join(SRC_DIR, 'routes/auth/callback/+server.ts'), 'utf8');
	assert.ok(callback.includes('handleCallback'), 'Should use handleCallback');
	assert.ok(callback.includes('GET'), 'Should export GET handler');
});

test('sign-out route handles session termination', () => {
	const signOut = readFileSync(join(SRC_DIR, 'routes/auth/sign-out/+server.ts'), 'utf8');
	assert.ok(signOut.includes('signOut'), 'Should use signOut');
	assert.ok(signOut.includes('GET'), 'Should export GET handler');
});

test('layout.server.ts provides user and signInUrl', () => {
	const layout = readFileSync(join(SRC_DIR, 'routes/+layout.server.ts'), 'utf8');
	assert.ok(layout.includes('getUser'), 'Should call getUser');
	assert.ok(layout.includes('getSignInUrl'), 'Should call getSignInUrl');
	assert.ok(layout.includes('user'), 'Should return user');
	assert.ok(layout.includes('signInUrl'), 'Should return signInUrl');
});

test('layout.svelte renders auth UI', () => {
	const layout = readFileSync(join(SRC_DIR, 'routes/+layout.svelte'), 'utf8');
	assert.ok(layout.includes('data.user'), 'Should check data.user');
	assert.ok(layout.includes('Sign in'), 'Should show Sign in for unauthenticated');
	assert.ok(layout.includes('Sign out'), 'Should show Sign out for authenticated');
	assert.ok(layout.includes('data.signInUrl'), 'Should link to signInUrl');
	assert.ok(layout.includes('/auth/sign-out'), 'Should link to sign-out route');
});

test('auth helper provides requireAuth function', () => {
	const auth = readFileSync(join(SRC_DIR, 'lib/auth.ts'), 'utf8');
	assert.ok(auth.includes('requireAuth'), 'Should export requireAuth');
	assert.ok(auth.includes('redirect'), 'Should redirect unauthenticated users');
	assert.ok(auth.includes('returnTo'), 'Should preserve return path');
});

// === Ecosystem config loads .env ===
console.log('\n  Ecosystem config:');

test('ecosystem.config.cjs loads .env file', () => {
	const config = readFileSync(join(HUB_DIR, 'ecosystem.config.cjs'), 'utf8');
	assert.ok(config.includes('.env'), 'Should reference .env file');
	assert.ok(config.includes('fs.existsSync'), 'Should check if .env exists');
	assert.ok(config.includes('readFileSync'), 'Should read .env contents');
});

test('ecosystem.config.cjs merges env vars', () => {
	const config = require(join(HUB_DIR, 'ecosystem.config.cjs'));
	const env = config.apps[0].env;
	assert.strictEqual(env.PORT, 3100, 'Should have PORT 3100');
	assert.strictEqual(env.HOST, '127.0.0.1', 'Should have HOST');
	assert.strictEqual(env.NODE_ENV, 'production', 'Should have NODE_ENV');
	assert.ok(env.WORKOS_CLIENT_ID, 'Should have WORKOS_CLIENT_ID from .env');
	assert.ok(env.WORKOS_API_KEY, 'Should have WORKOS_API_KEY from .env');
	assert.ok(env.WORKOS_REDIRECT_URI, 'Should have WORKOS_REDIRECT_URI from .env');
	assert.ok(env.WORKOS_COOKIE_PASSWORD, 'Should have WORKOS_COOKIE_PASSWORD from .env');
});

// === Live server auth flow (e2e) ===
console.log('\n  Live auth flow (e2e):');

test('hub responds on port 3100', () => {
	const status = execSync('curl -s -o /dev/null -w "%{http_code}" http://localhost:3100', {
		encoding: 'utf8',
		timeout: 10000
	}).trim();
	assert.strictEqual(status, '200', 'Should respond with 200');
});

test('landing page is public (no auth redirect)', () => {
	const html = execSync('curl -s http://localhost:3100', {
		encoding: 'utf8',
		timeout: 10000
	});
	assert.ok(html.includes('Tools that'), 'Should show landing page content');
	assert.ok(html.includes('kaivalo'), 'Should include kaivalo branding');
});

test('page renders nav with sign-in button (unauthenticated)', () => {
	const html = execSync('curl -s http://localhost:3100', {
		encoding: 'utf8',
		timeout: 10000
	});
	assert.ok(html.includes('<nav'), 'Should have nav element');
	assert.ok(html.includes('Sign in'), 'Should show Sign in button');
});

test('sign-in URL points to WorkOS authorize endpoint', () => {
	const html = execSync('curl -s http://localhost:3100', {
		encoding: 'utf8',
		timeout: 10000
	});
	assert.ok(html.includes('api.workos.com/user_management/authorize'), 'Should link to WorkOS authorize');
});

test('sign-in URL includes correct client_id', () => {
	const html = execSync('curl -s http://localhost:3100', {
		encoding: 'utf8',
		timeout: 10000
	});
	assert.ok(html.includes('client_01KHP4YNVEGTA7A409SKG74W8D'), 'Should include correct client_id');
});

test('sign-in URL includes correct redirect_uri', () => {
	const html = execSync('curl -s http://localhost:3100', {
		encoding: 'utf8',
		timeout: 10000
	});
	assert.ok(
		html.includes('redirect_uri=http%3A%2F%2Flocalhost%3A3100%2Fauth%2Fcallback'),
		'Should include redirect_uri pointing to /auth/callback'
	);
});

test('sign-in URL uses authkit provider', () => {
	const html = execSync('curl -s http://localhost:3100', {
		encoding: 'utf8',
		timeout: 10000
	});
	assert.ok(html.includes('provider=authkit'), 'Should use authkit provider');
});

test('auth callback route exists (not 404)', () => {
	const status = execSync('curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/auth/callback', {
		encoding: 'utf8',
		timeout: 10000
	}).trim();
	assert.notStrictEqual(status, '404', 'Callback route should not be 404');
});

test('auth sign-out route exists (not 404)', () => {
	const status = execSync('curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/auth/sign-out', {
		encoding: 'utf8',
		timeout: 10000
	}).trim();
	assert.notStrictEqual(status, '404', 'Sign-out route should not be 404');
});

test('page does not redirect unauthenticated users away from landing', () => {
	const result = execSync('curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:3100', {
		encoding: 'utf8',
		timeout: 10000
	}).trim();
	assert.ok(result.startsWith('200'), 'Should not redirect — status should be 200');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
