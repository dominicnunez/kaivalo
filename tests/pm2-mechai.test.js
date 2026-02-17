/**
 * Test: PM2 MechanicAI (mechai) service
 * Validates that mechai is running with PM2 on port 3101.
 * Skips all tests if mechanic-ai directory is not present (can't run without source).
 */

import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Ensure pm2 is on PATH (installed via npm global)
const npmGlobalBin = join(homedir(), '.npm-global', 'bin');
if (!process.env.PATH.includes(npmGlobalBin)) {
  process.env.PATH = `${npmGlobalBin}:${process.env.PATH}`;
}

const mechaiDir = '/home/kai/pets/mechanic-ai';

if (!existsSync(mechaiDir)) {
  console.log('\n--- PM2 MechanicAI (mechai) Tests ---\n');
  console.log('- All tests skipped (mechanic-ai directory not present)');
  console.log('\nPM2 mechai tests: 0 passed, 0 failed (10 skipped)\n');
  process.exit(0);
}

// Only run tests if directory exists
import { execSync } from 'child_process';
import http from 'http';

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

test('pm2 is installed and accessible', () => {
  const result = execSync('which pm2', { encoding: 'utf-8' });
  assert(result.includes('pm2'), 'pm2 command should be found');
});

test('mechai process is registered in PM2', () => {
  const result = execSync('pm2 jlist', { encoding: 'utf-8' });
  const processes = JSON.parse(result);
  const mechai = processes.find(p => p.name === 'mechai');
  assert(mechai, 'mechai process should be registered in PM2');
});

test('mechai process is online', () => {
  const result = execSync('pm2 jlist', { encoding: 'utf-8' });
  const processes = JSON.parse(result);
  const mechai = processes.find(p => p.name === 'mechai');
  assert(mechai && mechai.pm2_env.status === 'online', 'mechai should have status "online"');
});

test('mechai runs build/index.js', () => {
  const result = execSync('pm2 jlist', { encoding: 'utf-8' });
  const processes = JSON.parse(result);
  const mechai = processes.find(p => p.name === 'mechai');
  assert(mechai && mechai.pm2_env.pm_exec_path.endsWith('build/index.js'),
    'mechai should run build/index.js');
});

test('mechai has PORT=3101 environment variable', () => {
  const result = execSync('pm2 jlist', { encoding: 'utf-8' });
  const processes = JSON.parse(result);
  const mechai = processes.find(p => p.name === 'mechai');
  const port = mechai?.pm2_env?.env?.PORT || mechai?.pm2_env?.PORT;
  assert(port === 3101 || port === '3101', 'mechai should have PORT=3101');
});

test('mechai has NODE_ENV=production environment variable', () => {
  const result = execSync('pm2 jlist', { encoding: 'utf-8' });
  const processes = JSON.parse(result);
  const mechai = processes.find(p => p.name === 'mechai');
  const nodeEnv = mechai?.pm2_env?.env?.NODE_ENV || mechai?.pm2_env?.NODE_ENV;
  assert(nodeEnv === 'production', 'mechai should have NODE_ENV=production');
});

test('mechai has a valid PID', () => {
  const result = execSync('pm2 jlist', { encoding: 'utf-8' });
  const processes = JSON.parse(result);
  const mechai = processes.find(p => p.name === 'mechai');
  assert(mechai && mechai.pid > 0, 'mechai should have a valid PID');
});

async function runAsyncTests() {
  try {
    const response = await httpGet('http://localhost:3101/mechai/');

    test('mechai responds with HTTP 200 on port 3101', () => {
      assert(response.statusCode === 200, `Expected 200, got ${response.statusCode}`);
    });

    test('mechai serves HTML content', () => {
      assert(response.headers['content-type'].includes('text/html'),
        'Response should be HTML');
    });

    test('mechai serves MechanicAI app', () => {
      assert(response.body.includes('MechanicAI') || response.body.includes('mechai'),
        'Response should include MechanicAI branding');
    });
  } catch (error) {
    test('mechai responds on port 3101', () => {
      throw new Error(`HTTP request failed: ${error.message}`);
    });
  }

  console.log(`\nPM2 mechai tests: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runAsyncTests();
