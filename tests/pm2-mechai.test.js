/**
 * Test: PM2 MechanicAI (mechai) service
 * Validates that mechai is running with PM2 on port 3101
 */

import { execSync } from 'child_process';
import http from 'http';

const projectRoot = '/home/kai/pets/kaivalo';
const mechaiRoot = '/home/kai/pets/mechanic-ai';

// Simple test runner
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Helper: Make HTTP request
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data, headers: res.headers }));
    }).on('error', reject);
  });
}

console.log('\n--- PM2 MechanicAI (mechai) Tests ---\n');

// Test 1: PM2 is installed
test('pm2 is installed and accessible', () => {
  const result = execSync('which pm2', { encoding: 'utf-8' });
  assert(result.includes('pm2'), 'pm2 command should be found');
});

// Test 2: mechai process is registered in PM2
test('mechai process is registered in PM2', () => {
  const result = execSync('pm2 jlist', { encoding: 'utf-8' });
  const processes = JSON.parse(result);
  const mechai = processes.find(p => p.name === 'mechai');
  assert(mechai, 'mechai process should be registered in PM2');
});

// Test 3: mechai process is online
test('mechai process is online', () => {
  const result = execSync('pm2 jlist', { encoding: 'utf-8' });
  const processes = JSON.parse(result);
  const mechai = processes.find(p => p.name === 'mechai');
  assert(mechai && mechai.pm2_env.status === 'online', 'mechai should have status "online"');
});

// Test 4: mechai is running the correct script
test('mechai runs build/index.js', () => {
  const result = execSync('pm2 jlist', { encoding: 'utf-8' });
  const processes = JSON.parse(result);
  const mechai = processes.find(p => p.name === 'mechai');
  assert(mechai && mechai.pm2_env.pm_exec_path.endsWith('build/index.js'),
    'mechai should run build/index.js');
});

// Test 5: mechai has correct PORT environment variable
test('mechai has PORT=3101 environment variable', () => {
  const result = execSync('pm2 jlist', { encoding: 'utf-8' });
  const processes = JSON.parse(result);
  const mechai = processes.find(p => p.name === 'mechai');
  const port = mechai?.pm2_env?.env?.PORT || mechai?.pm2_env?.PORT;
  assert(port === 3101 || port === '3101', 'mechai should have PORT=3101');
});

// Test 6: mechai has NODE_ENV=production
test('mechai has NODE_ENV=production environment variable', () => {
  const result = execSync('pm2 jlist', { encoding: 'utf-8' });
  const processes = JSON.parse(result);
  const mechai = processes.find(p => p.name === 'mechai');
  const nodeEnv = mechai?.pm2_env?.env?.NODE_ENV || mechai?.pm2_env?.NODE_ENV;
  assert(nodeEnv === 'production', 'mechai should have NODE_ENV=production');
});

// Test 7: mechai has a valid PID
test('mechai has a valid PID', () => {
  const result = execSync('pm2 jlist', { encoding: 'utf-8' });
  const processes = JSON.parse(result);
  const mechai = processes.find(p => p.name === 'mechai');
  assert(mechai && mechai.pid > 0, 'mechai should have a valid PID');
});

// Async tests for HTTP
async function runAsyncTests() {
  // Test 8: mechai responds on port 3101
  await new Promise(resolve => {
    test('mechai responds with HTTP 200 on port 3101 at /mechai/', async () => {
      const response = await httpGet('http://localhost:3101/mechai/');
      assert(response.statusCode === 200, `Expected 200, got ${response.statusCode}`);
    });
    resolve();
  });

  // Wait for test to complete
  await new Promise(resolve => setTimeout(resolve, 500));

  try {
    const response = await httpGet('http://localhost:3101/mechai/');

    test('mechai serves HTML content', () => {
      assert(response.headers['content-type'].includes('text/html'),
        'Response should be HTML');
    });

    test('mechai serves MechanicAI app', () => {
      assert(response.body.includes('MechanicAI') || response.body.includes('mechai'),
        'Response should include MechanicAI branding');
    });

  } catch (error) {
    test('mechai serves HTML content', () => {
      throw new Error(`HTTP request failed: ${error.message}`);
    });
    test('mechai serves MechanicAI app', () => {
      throw new Error(`HTTP request failed: ${error.message}`);
    });
  }

  // Summary
  console.log(`\nPM2 mechai tests: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAsyncTests();
