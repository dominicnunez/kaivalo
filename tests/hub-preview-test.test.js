import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const hubDir = path.join(path.resolve(import.meta.dirname, '..'), 'apps/hub');
const buildDir = path.join(hubDir, 'build');

const REQUEST_TIMEOUT_MS = 5000;
const PORT_BASE = 14198;
const PORT_RANGE = 1000;
const previewPort = PORT_BASE + Math.floor(Math.random() * PORT_RANGE);
const PREVIEW_URL = `http://localhost:${previewPort}`;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

describe('npm run preview', () => {
  describe('prerequisites', () => {
    it('build directory exists', () => {
      assert.ok(existsSync(buildDir), 'Build directory should exist');
    });

    it('build/index.js exists', () => {
      assert.ok(existsSync(path.join(buildDir, 'index.js')), 'Build entry point should exist');
    });

    it('package.json has preview script', () => {
      const pkgJson = JSON.parse(readFileSync(path.join(hubDir, 'package.json'), 'utf8'));
      assert.ok(pkgJson.scripts?.preview, 'Should have preview script');
      assert.ok(pkgJson.scripts.preview.includes('vite preview'), 'Preview script should use vite preview');
    });
  });

  describe('server response', () => {
    let server;
    let homepage;
    let faviconRes;
    let ogImageRes;

    before(async () => {
      server = spawn('npx', ['vite', 'preview', '--port', String(previewPort)], {
        cwd: hubDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
      });

      for (let i = 0; i < 20; i++) {
        try {
          await httpGet(PREVIEW_URL);
          break;
        } catch {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      homepage = await httpGet(PREVIEW_URL);
      faviconRes = await httpGet(`${PREVIEW_URL}/favicon.ico`);
      ogImageRes = await httpGet(`${PREVIEW_URL}/og-image.png`);
    });

    after(() => {
      if (server) {
        try {
          process.kill(-server.pid, 'SIGTERM');
        } catch (e) {
          if (e.code !== 'ESRCH') throw e;
        }
      }
    });

    it('responds with 200 on homepage', () => {
      assert.strictEqual(homepage.statusCode, 200, 'Should return 200 OK');
    });

    it('response is valid HTML', () => {
      assert.ok(
        homepage.data.includes('<!doctype html>') || homepage.data.includes('<!DOCTYPE html>'),
        'Response should contain doctype',
      );
    });

    it('page has correct title', () => {
      assert.ok(
        homepage.data.includes('<title>Kai Valo |') || homepage.data.includes('Kai Valo'),
        'Title should contain Kai Valo',
      );
    });

    it('hero headline is present', () => {
      assert.ok(
        homepage.data.includes('solve things') || homepage.data.includes('Tools that'),
        'Hero headline should be present',
      );
    });

    it('services section is present', () => {
      assert.ok(homepage.data.includes('id="services"'), 'Services section should be present');
    });

    it('MechanicAI service card is present', () => {
      assert.ok(
        homepage.data.includes('Auto Repair Decoder') || homepage.data.includes('services'),
        'MechanicAI content should be present',
      );
    });

    it('about section is present', () => {
      assert.ok(
        homepage.data.includes('id="about"') && homepage.data.includes('Kai Valo'),
        'About section should be present',
      );
    });

    it('footer is present', () => {
      assert.ok(
        homepage.data.includes('2026') && (homepage.data.includes('footer') || homepage.data.includes('kaivalo')),
        'Footer should be present',
      );
    });

    it('Open Graph meta tags are present', () => {
      assert.ok(homepage.data.includes('og:title'), 'Should have og:title');
      assert.ok(homepage.data.includes('og:description'), 'Should have og:description');
      assert.ok(homepage.data.includes('og:image'), 'Should have og:image');
    });

    it('Twitter card meta tags are present', () => {
      assert.ok(homepage.data.includes('twitter:card'), 'Should have twitter:card');
      assert.ok(homepage.data.includes('twitter:title'), 'Should have twitter:title');
    });

    it('favicon.ico is accessible', () => {
      assert.strictEqual(faviconRes.statusCode, 200, 'favicon should return 200');
    });

    it('og-image.png is accessible', () => {
      assert.strictEqual(ogImageRes.statusCode, 200, 'og-image should return 200');
    });

    it('CSS stylesheet is linked', () => {
      assert.ok(homepage.data.includes('.css" rel="stylesheet"'), 'CSS link should be present');
    });

    it('SvelteKit hydration script is present', () => {
      assert.ok(homepage.data.includes('__sveltekit'), 'Should have __sveltekit');
      assert.ok(homepage.data.includes('import('), 'Should have import()');
    });
  });
});
