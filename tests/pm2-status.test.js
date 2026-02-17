/**
 * Test: PM2 status verification
 * Validates that pm2 status shows expected services running
 */

import { execSync } from 'child_process';
import http from 'http';

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

function testAsync(name, fn) {
  return fn()
    .then(() => {
      console.log(`✓ ${name}`);
      passed++;
    })
    .catch(err => {
      console.log(`✗ ${name}`);
      console.log(`  ${err.message}`);
      failed++;
    });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

console.log('\n--- PM2 Status Verification Tests ---\n');

// Get process list once
const pm2Output = execSync('pm2 jlist', { encoding: 'utf8' });
const processes = JSON.parse(pm2Output);

// ============================================================================
// PM2 general status tests
// ============================================================================

test('pm2 is running and accessible', () => {
  const version = execSync('pm2 --version', { encoding: 'utf8' }).trim();
  assert(version.length > 0, 'pm2 should return a version');
});

test('pm2 has registered processes', () => {
  assert(processes.length > 0, 'pm2 should have at least one process');
});

// ============================================================================
// kaivalo-hub status tests
// ============================================================================

test('kaivalo-hub is in pm2 process list', () => {
  const hub = processes.find(p => p.name === 'kaivalo-hub');
  assert(hub, 'kaivalo-hub should be registered in pm2');
});

test('kaivalo-hub status is online', () => {
  const hub = processes.find(p => p.name === 'kaivalo-hub');
  assert(hub && hub.pm2_env.status === 'online', 'kaivalo-hub should be online');
});

test('kaivalo-hub has a valid PID', () => {
  const hub = processes.find(p => p.name === 'kaivalo-hub');
  assert(hub && hub.pid > 0, 'kaivalo-hub should have a valid PID');
});

test('kaivalo-hub runs build/index.js', () => {
  const hub = processes.find(p => p.name === 'kaivalo-hub');
  assert(
    hub && hub.pm2_env.pm_exec_path.includes('build/index.js'),
    'kaivalo-hub should run build/index.js'
  );
});

test('kaivalo-hub is configured for port 3100', () => {
  const hub = processes.find(p => p.name === 'kaivalo-hub');
  const port = hub?.pm2_env?.env?.PORT ?? hub?.pm2_env?.PORT;
  assert(String(port) === '3100', `kaivalo-hub PORT should be 3100, got ${port}`);
});

test('kaivalo-hub is in production mode', () => {
  const hub = processes.find(p => p.name === 'kaivalo-hub');
  const nodeEnv = hub?.pm2_env?.env?.NODE_ENV ?? hub?.pm2_env?.NODE_ENV;
  assert(nodeEnv === 'production', 'kaivalo-hub NODE_ENV should be production');
});

test('kaivalo-hub has zero or low restart count', () => {
  const hub = processes.find(p => p.name === 'kaivalo-hub');
  assert(
    hub && hub.pm2_env.restart_time < 10,
    `kaivalo-hub should have low restarts, got ${hub?.pm2_env?.restart_time}`
  );
});

test('kaivalo-hub is using memory', () => {
  const hub = processes.find(p => p.name === 'kaivalo-hub');
  assert(hub && hub.monit.memory > 0, 'kaivalo-hub should be using memory (indicates running)');
});

// ============================================================================
// HTTP verification
// ============================================================================

async function httpTests() {
  await testAsync('kaivalo-hub responds on port 3100', () => {
    return new Promise((resolve, reject) => {
      const req = http.get('http://localhost:3100/', res => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Expected 200, got ${res.statusCode}`));
        }
        res.resume();
      });
      req.on('error', reject);
      req.setTimeout(5000, () => reject(new Error('Request timeout')));
    });
  });

  await testAsync('kaivalo-hub serves landing page HTML', () => {
    return new Promise((resolve, reject) => {
      let data = '';
      const req = http.get('http://localhost:3100/', res => {
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          const hasDoctype = data.toLowerCase().includes('<!doctype html>');
          const hasContent = data.includes('Kai Valo') || data.includes('AI Tools');
          if (hasDoctype && hasContent) {
            resolve();
          } else {
            reject(new Error('Response should be HTML with landing page content'));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => reject(new Error('Request timeout')));
    });
  });

  // Summary
  console.log(`\npm2 status verification: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

httpTests();
