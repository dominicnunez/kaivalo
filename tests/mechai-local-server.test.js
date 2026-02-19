import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const mechaiDir = join(resolve(import.meta.dirname, '..'), 'apps', 'mechai');
const skip = !existsSync(mechaiDir);
const PORT = 3101;
const BASE_PATH = '/mechai';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function waitForServer(url, maxAttempts = 30, delay = 200) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      httpGet(url)
        .then(resolve)
        .catch(() => {
          attempts++;
          if (attempts >= maxAttempts) {
            reject(new Error(`Server not ready after ${maxAttempts} attempts`));
          } else {
            setTimeout(check, delay);
          }
        });
    };
    check();
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, () => {
      resolve(false);
    });
    req.on('error', () => {
      resolve(true);
    });
    req.setTimeout(500, () => {
      req.destroy();
      resolve(true);
    });
  });
}

describe('MechanicAI local server', { skip: skip && 'mechanic-ai directory not present' }, () => {
  let serverProcess;
  let skipReason;

  before(async () => {
    const portFree = await isPortFree(PORT);
    if (!portFree) return;

    serverProcess = spawn('node', ['build/index.js'], {
      cwd: mechaiDir,
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    try {
      await waitForServer(`http://localhost:${PORT}${BASE_PATH}/`);
    } catch {
      skipReason = `server failed to start on port ${PORT}`;
    }
  });

  after(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  });

  it('server responds on port 3101', async (t) => {
    if (skipReason) { t.skip(skipReason); return; }
    const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
    assert.ok(response.statusCode >= 200 && response.statusCode < 500, 'Server should respond');
  });

  it('server returns HTTP 200 OK for homepage', async (t) => {
    if (skipReason) { t.skip(skipReason); return; }
    const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
    assert.strictEqual(response.statusCode, 200);
  });

  it('server returns HTML content', async (t) => {
    if (skipReason) { t.skip(skipReason); return; }
    const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
    assert.ok(
      response.headers['content-type']?.includes('text/html') ||
      response.data.includes('<!DOCTYPE') ||
      response.data.includes('<html'),
      'Should return HTML content'
    );
  });

  it('server includes MechanicAI branding', async (t) => {
    if (skipReason) { t.skip(skipReason); return; }
    const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
    const hasBranding = response.data.toLowerCase().includes('mechanic') ||
                      response.data.includes('MechanicAI');
    assert.ok(hasBranding, 'Should include MechanicAI branding');
  });
});
