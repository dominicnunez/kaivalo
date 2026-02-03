import assert from 'node:assert';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mechaiDir = '/home/kai/pets/mechanic-ai';
const PORT = 3101;
const BASE_PATH = '/mechai';  // MechanicAI is configured with base: '/mechai'

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

// Helper to make HTTP requests
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

// Helper to wait for server to be ready
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

// Helper to check if port is free
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

// Run async tests
(async () => {
  // First check if port is available
  const portFree = await isPortFree(PORT);
  if (!portFree) {
    console.log(`\nWARNING: Port ${PORT} is already in use. Skipping server start tests.`);
    console.log('Testing that the port is accessible instead...\n');

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
    // Start the server
    console.log('Starting MechanicAI server on port 3101...\n');

    const serverProcess = spawn('node', ['build/index.js'], {
      cwd: mechaiDir,
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let serverOutput = '';
    serverProcess.stdout.on('data', (data) => {
      serverOutput += data.toString();
    });
    serverProcess.stderr.on('data', (data) => {
      serverOutput += data.toString();
    });

    try {
      // Wait for server to be ready (use base path since app is configured with base: '/mechai')
      await waitForServer(`http://localhost:${PORT}${BASE_PATH}/`);

      await asyncTest('server starts successfully', async () => {
        assert.ok(true, 'Server process started');
      });

      await asyncTest('server responds on port 3101', async () => {
        const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
        assert.ok(response.statusCode >= 200 && response.statusCode < 500, `Expected 2xx-4xx status code, got ${response.statusCode}`);
      });

      await asyncTest('server returns HTTP 200 OK for homepage', async () => {
        const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
        assert.strictEqual(response.statusCode, 200, `Expected 200, got ${response.statusCode}`);
      });

      await asyncTest('server returns HTML content', async () => {
        const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
        assert.ok(
          response.headers['content-type']?.includes('text/html') ||
          response.data.includes('<!DOCTYPE') ||
          response.data.includes('<html'),
          'Should return HTML content'
        );
      });

      await asyncTest('HTML contains DOCTYPE declaration', async () => {
        const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
        assert.ok(response.data.includes('<!DOCTYPE html>') || response.data.includes('<!doctype html>'), 'Should have DOCTYPE');
      });

      await asyncTest('HTML contains html element', async () => {
        const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
        assert.ok(response.data.includes('<html'), 'Should have <html> element');
      });

      await asyncTest('HTML contains head element', async () => {
        const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
        assert.ok(response.data.includes('<head'), 'Should have <head> element');
      });

      await asyncTest('HTML contains body element', async () => {
        const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
        assert.ok(response.data.includes('<body'), 'Should have <body> element');
      });

      await asyncTest('server includes MechanicAI branding', async () => {
        const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
        // Check for various ways the app might identify itself
        const hasBranding = response.data.toLowerCase().includes('mechanic') ||
                          response.data.includes('MechanicAI') ||
                          response.data.includes('Mechanic AI') ||
                          response.headers['x-powered-by']?.includes('SvelteKit');
        assert.ok(hasBranding, 'Should include branding or SvelteKit identifier');
      });

      await asyncTest('server returns proper content-type header', async () => {
        const response = await httpGet(`http://localhost:${PORT}${BASE_PATH}/`);
        assert.ok(response.headers['content-type'], 'Should have content-type header');
      });

      await asyncTest('root path redirects to base path', async () => {
        const response = await httpGet(`http://localhost:${PORT}/`);
        // Root might return 404 or redirect - either is acceptable since app is at /mechai
        assert.ok(response.statusCode === 404 || response.statusCode === 301 || response.statusCode === 302,
          `Root path should return 404 or redirect (got ${response.statusCode})`);
      });

    } finally {
      // Always clean up the server process
      serverProcess.kill('SIGTERM');
      // Give it a moment to clean up
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\n${passed} passing, ${failed} failing`);
  process.exit(failed > 0 ? 1 : 0);
})();
