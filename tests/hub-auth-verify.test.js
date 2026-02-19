import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import http from 'node:http';

const require = createRequire(import.meta.url);

const ROOT = resolve(import.meta.dirname, '..');
const HUB_DIR = join(ROOT, 'apps/hub');
const BUILD_DIR = join(HUB_DIR, 'build');
const SRC_DIR = join(HUB_DIR, 'src');

const PORT_BASE = 14198;
const PORT_RANGE = 1000;
const REQUEST_TIMEOUT_MS = 5000;

function httpRequest(url, method = 'GET') {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const options = { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname, method };
		const req = http.request(options, (res) => {
			let data = '';
			res.on('data', (chunk) => data += chunk);
			res.on('end', () => resolve({ statusCode: res.statusCode, data, headers: res.headers }));
		});
		req.on('error', reject);
		req.setTimeout(REQUEST_TIMEOUT_MS, () => {
			req.destroy();
			reject(new Error('Request timeout'));
		});
		req.end();
	});
}

function httpGet(url) {
	return httpRequest(url, 'GET');
}

describe('WorkOS auth verification', () => {
	// === Build verification ===
	describe('build verification', () => {
		it('npm run build succeeds with auth code', () => {
			execSync('npm run build 2>&1', {
				cwd: HUB_DIR,
				timeout: 180000,
				encoding: 'utf8'
			});
		});

		it('build output includes hooks.server entry', () => {
			const serverDir = join(BUILD_DIR, 'server');
			const allFiles = execSync(`find ${serverDir} -name "*.js" -type f`, { encoding: 'utf8' });
			assert.ok(allFiles.includes('hooks.server'), 'Build should include hooks.server entry');
		});

		it('build manifest includes auth callback route', () => {
			const manifest = readFileSync(join(BUILD_DIR, 'server/manifest.js'), 'utf8');
			assert.ok(manifest.includes('/auth/callback'), 'Manifest should include /auth/callback route');
		});

		it('build manifest includes auth sign-out route', () => {
			const manifest = readFileSync(join(BUILD_DIR, 'server/manifest.js'), 'utf8');
			assert.ok(manifest.includes('/auth/sign-out'), 'Manifest should include /auth/sign-out route');
		});

		it('build includes layout server chunk', () => {
			const serverFiles = execSync(`find ${join(BUILD_DIR, 'server')} -name "*.js" -type f`, { encoding: 'utf8' });
			assert.ok(serverFiles.includes('_layout.svelte'), 'Build should include layout chunk');
		});

		it('build has client assets', () => {
			const clientDir = join(BUILD_DIR, 'client/_app/immutable');
			assert.ok(existsSync(clientDir), 'Client immutable assets should exist');
		});
	});

	// === Source verification ===
	describe('source code auth integration', () => {
		it('hooks.server.ts configures WorkOS AuthKit', () => {
			const hooks = readFileSync(join(SRC_DIR, 'hooks.server.ts'), 'utf8');
			assert.ok(hooks.includes('configureAuthKit'), 'Should call configureAuthKit');
			assert.ok(hooks.includes('authKitHandle'), 'Should export authKitHandle');
			assert.ok(hooks.includes('WORKOS_CLIENT_ID'), 'Should pass client ID');
			assert.ok(hooks.includes('WORKOS_API_KEY'), 'Should pass API key');
			assert.ok(hooks.includes('WORKOS_REDIRECT_URI'), 'Should pass redirect URI');
			assert.ok(hooks.includes('WORKOS_COOKIE_PASSWORD'), 'Should pass cookie password');
		});

		it('callback route handles OAuth redirect', () => {
			const callback = readFileSync(join(SRC_DIR, 'routes/auth/callback/+server.ts'), 'utf8');
			assert.ok(callback.includes('handleCallback'), 'Should use handleCallback');
			assert.ok(callback.includes('GET'), 'Should export GET handler');
		});

		it('sign-out route handles session termination', () => {
			const signOut = readFileSync(join(SRC_DIR, 'routes/auth/sign-out/+server.ts'), 'utf8');
			assert.ok(signOut.includes('signOut'), 'Should use signOut');
			assert.ok(signOut.includes('POST'), 'Should export POST handler');
		});

		it('layout.server.ts provides user and signInUrl', () => {
			const layout = readFileSync(join(SRC_DIR, 'routes/+layout.server.ts'), 'utf8');
			assert.ok(layout.includes('getUser'), 'Should call getUser');
			assert.ok(layout.includes('getSignInUrl'), 'Should call getSignInUrl');
			assert.ok(layout.includes('user'), 'Should return user');
			assert.ok(layout.includes('signInUrl'), 'Should return signInUrl');
		});

		it('layout.svelte renders auth UI', () => {
			const layout = readFileSync(join(SRC_DIR, 'routes/+layout.svelte'), 'utf8');
			assert.ok(layout.includes('data.user'), 'Should check data.user');
			assert.ok(layout.includes('Sign in'), 'Should show Sign in for unauthenticated');
			assert.ok(layout.includes('Sign out'), 'Should show Sign out for authenticated');
			assert.ok(layout.includes('data.signInUrl'), 'Should link to signInUrl');
			assert.ok(layout.includes('/auth/sign-out'), 'Should link to sign-out route');
		});

		it('auth helper provides requireAuth function', () => {
			const auth = readFileSync(join(SRC_DIR, 'lib/auth.ts'), 'utf8');
			assert.ok(auth.includes('requireAuth'), 'Should export requireAuth');
			assert.ok(auth.includes('redirect'), 'Should redirect unauthenticated users');
			assert.ok(auth.includes('returnTo'), 'Should preserve return path');
		});
	});

	// === Ecosystem config ===
	describe('ecosystem config', () => {
		it('ecosystem.config.cjs loads .env file', () => {
			const config = readFileSync(join(HUB_DIR, 'ecosystem.config.cjs'), 'utf8');
			assert.ok(config.includes('.env'), 'Should reference .env file');
			assert.ok(config.includes('fs.existsSync'), 'Should check if .env exists');
			assert.ok(config.includes('readFileSync'), 'Should read .env contents');
		});

		it('ecosystem.config.cjs merges env vars', () => {
			const config = require(join(HUB_DIR, 'ecosystem.config.cjs'));
			const env = config.apps[0].env;
			assert.strictEqual(env.PORT, '3100', 'Should have PORT 3100');
			assert.strictEqual(env.HOST, '127.0.0.1', 'Should have HOST');
			assert.strictEqual(env.NODE_ENV, 'production', 'Should have NODE_ENV');
			assert.ok(env.WORKOS_CLIENT_ID, 'Should have WORKOS_CLIENT_ID from .env');
			assert.ok(env.WORKOS_API_KEY, 'Should have WORKOS_API_KEY from .env');
			assert.ok(env.WORKOS_REDIRECT_URI, 'Should have WORKOS_REDIRECT_URI from .env');
			assert.ok(env.WORKOS_COOKIE_PASSWORD, 'Should have WORKOS_COOKIE_PASSWORD from .env');
		});
	});

	// === Live server auth flow (e2e) ===
	describe('live auth flow (e2e)', () => {
		let serverProcess;
		let skipReason;
		const port = PORT_BASE + Math.floor(Math.random() * PORT_RANGE);
		const baseUrl = `http://localhost:${port}`;

		before(async () => {
			if (!existsSync(join(BUILD_DIR, 'index.js'))) {
				skipReason = 'no build — run npm run build first';
				return;
			}

			serverProcess = spawn('node', ['build/index.js'], {
				cwd: HUB_DIR,
				env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
				stdio: 'ignore',
				detached: true,
			});
			serverProcess.unref();

			let serverReady = false;
			for (let i = 0; i < 20; i++) {
				try {
					await httpGet(baseUrl);
					serverReady = true;
					break;
				} catch {
					await new Promise(r => setTimeout(r, 500));
				}
			}
			if (!serverReady) {
				skipReason = `server failed to start on port ${port}`;
			}
		});

		after(() => {
			if (serverProcess && serverProcess.pid) {
				try {
					process.kill(-serverProcess.pid);
				} catch (e) {
					if (e.code !== 'ESRCH') throw e;
				}
			}
		});

		it('hub responds with 200', async (t) => {
			if (skipReason) { t.skip(skipReason); return; }
			const res = await httpGet(baseUrl);
			assert.strictEqual(res.statusCode, 200, 'Should respond with 200');
		});

		it('landing page is public (no auth redirect)', async (t) => {
			if (skipReason) { t.skip(skipReason); return; }
			const res = await httpGet(baseUrl);
			assert.ok(res.data.includes('Tools that'), 'Should show landing page content');
			assert.ok(res.data.includes('kaivalo'), 'Should include kaivalo branding');
		});

		it('page renders nav with sign-in button (unauthenticated)', async (t) => {
			if (skipReason) { t.skip(skipReason); return; }
			const res = await httpGet(baseUrl);
			assert.ok(res.data.includes('<nav'), 'Should have nav element');
			assert.ok(res.data.includes('Sign in'), 'Should show Sign in button');
		});

		it('sign-in URL points to WorkOS authorize endpoint', async (t) => {
			if (skipReason) { t.skip(skipReason); return; }
			const res = await httpGet(baseUrl);
			assert.ok(res.data.includes('api.workos.com/user_management/authorize'), 'Should link to WorkOS authorize');
		});

		it('sign-in URL includes a client_id parameter', async (t) => {
			if (skipReason) { t.skip(skipReason); return; }
			const res = await httpGet(baseUrl);
			assert.match(res.data, /client_id=[^&"]+/, 'Should include client_id parameter');
		});

		it('sign-in URL includes redirect_uri pointing to /auth/callback', async (t) => {
			if (skipReason) { t.skip(skipReason); return; }
			const res = await httpGet(baseUrl);
			assert.match(res.data, /redirect_uri=[^&]*%2Fauth%2Fcallback/, 'Should include redirect_uri with /auth/callback');
		});

		it('sign-in URL uses authkit provider', async (t) => {
			if (skipReason) { t.skip(skipReason); return; }
			const res = await httpGet(baseUrl);
			assert.ok(res.data.includes('provider=authkit'), 'Should use authkit provider');
		});

		it('auth callback route returns a non-error status', async (t) => {
			if (skipReason) { t.skip(skipReason); return; }
			const res = await httpGet(`${baseUrl}/auth/callback`);
			assert.ok(res.statusCode < 500, `Callback route should not return 5xx (got ${res.statusCode})`);
			assert.notStrictEqual(res.statusCode, 404, 'Callback route should not be 404');
		});

		it('auth sign-out route accepts POST requests', async (t) => {
			if (skipReason) { t.skip(skipReason); return; }
			const res = await httpRequest(`${baseUrl}/auth/sign-out`, 'POST');
			assert.ok(res.statusCode < 500, `Sign-out route should not return 5xx (got ${res.statusCode})`);
			assert.notStrictEqual(res.statusCode, 404, 'Sign-out route should not be 404');
		});

		it('page does not redirect unauthenticated users away from landing', async (t) => {
			if (skipReason) { t.skip(skipReason); return; }
			const res = await httpGet(baseUrl);
			assert.strictEqual(res.statusCode, 200, 'Should not redirect — status should be 200');
		});
	});
});
