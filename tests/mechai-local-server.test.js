/**
 * Test: MechanicAI local server
 * Validates that mechanic-ai can be started and serves on port 3101.
 * Skips all tests if mechanic-ai directory is not present.
 */

import { existsSync } from 'fs';

const mechaiDir = '/home/kai/pets/mechanic-ai';

if (!existsSync(mechaiDir)) {
  console.log('Testing MechanicAI local server...\n');
  console.log('- All tests skipped (mechanic-ai directory not present)');
  console.log('\n0 passing, 0 failing (11 skipped)');
  process.exit(0);
}

// Only run tests if directory exists
import assert from 'node:assert';
import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = 3101;
const BASE_PATH = '/mechai';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed++;
    console.log(`✗ ${name}`);
    console.log(`  ${error.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed++;
    console.log(`✗ ${name}`);
    console.log(`  ${error.message}`);
  }
}

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

console.log('Testing MechanicAI local server...\n');

(async () => {
  const portFree = await isPortFree(PORT);
  if (!portFree) {
    console.log(`Port ${PORT} is already in use. Testing existing server...\n`);

    await asyncTest('existing server responds on port 3101', async () => {
      const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
      assert.ok(response.statusCode >= 200 && response.statusCode < 500, 'Server should respond');
    });

    await asyncTest('existing server returns HTML content', async () => {
      const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
      assert.ok(
        response.headers['content-type']?.includes('text/html') ||
        response.data.includes('<!DOCTYPE') ||
        response.data.includes('<html'),
        'Should return HTML content'
      );
    });
  } else {
    console.log('Starting MechanicAI server on port 3101...\n');

    const serverProcess = spawn('node', ['build/index.js'], {
      cwd: mechaiDir,
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    try {
      const startupResponse = await waitForServer(`http://localhost:${PORT}${BASE_PATH}/`);

      await asyncTest('server starts successfully', async () => {
        assert.ok(startupResponse.statusCode, 'Server should respond with an HTTP status code');
      });

      await asyncTest('server responds on port 3101', async () => {
        const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
        assert.ok(response.statusCode >= 200 && response.statusCode < 500);
      });

      await asyncTest('server returns HTTP 200 OK for homepage', async () => {
        const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
        assert.strictEqual(response.statusCode, 200);
      });

      await asyncTest('server returns HTML content', async () => {
        const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
        assert.ok(
          response.headers['content-type']?.includes('text/html') ||
          response.data.includes('<!DOCTYPE'),
          'Should return HTML content'
        );
      });

      await asyncTest('server includes MechanicAI branding', async () => {
        const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
        const hasBranding = response.data.toLowerCase().includes('mechanic') ||
                          response.data.includes('MechanicAI');
        assert.ok(hasBranding, 'Should include MechanicAI branding');
      });

    } finally {
      serverProcess.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\n${passed} passing, ${failed} failing`);
  process.exit(failed > 0 ? 1 : 0);
})();
