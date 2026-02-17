import { execSync } from 'child_process';
import http from 'http';
import { homedir } from 'os';
import { join } from 'path';

// Ensure pm2 is on PATH (installed via npm global)
const npmGlobalBin = join(homedir(), '.npm-global', 'bin');
if (!process.env.PATH.includes(npmGlobalBin)) {
  process.env.PATH = `${npmGlobalBin}:${process.env.PATH}`;
}

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

console.log('\nTesting PM2 kaivalo-hub service...\n');

// ============================================================================
// PM2 status tests
// ============================================================================

test('pm2 is installed', () => {
  try {
    execSync('which pm2', { encoding: 'utf8' });
  } catch {
    throw new Error('pm2 is not installed');
  }
});

test('kaivalo-hub is registered in pm2', () => {
  const output = execSync('pm2 jlist', { encoding: 'utf8' });
  const processes = JSON.parse(output);
  const hub = processes.find(p => p.name === 'kaivalo-hub');
  assert(hub, 'kaivalo-hub should be in pm2 process list');
});

test('kaivalo-hub is online', () => {
  const output = execSync('pm2 jlist', { encoding: 'utf8' });
  const processes = JSON.parse(output);
  const hub = processes.find(p => p.name === 'kaivalo-hub');
  assert(hub && hub.pm2_env.status === 'online', 'kaivalo-hub should be online');
});

test('kaivalo-hub is running with correct script', () => {
  const output = execSync('pm2 jlist', { encoding: 'utf8' });
  const processes = JSON.parse(output);
  const hub = processes.find(p => p.name === 'kaivalo-hub');
  assert(hub && hub.pm2_env.pm_exec_path.includes('build/index.js'), 'should run build/index.js');
});

test('kaivalo-hub has PORT 3100 in env', () => {
  const output = execSync('pm2 jlist', { encoding: 'utf8' });
  const processes = JSON.parse(output);
  const hub = processes.find(p => p.name === 'kaivalo-hub');
  assert(hub && hub.pm2_env.env && hub.pm2_env.env.PORT === 3100, 'PORT should be 3100');
});

test('kaivalo-hub has NODE_ENV production', () => {
  const output = execSync('pm2 jlist', { encoding: 'utf8' });
  const processes = JSON.parse(output);
  const hub = processes.find(p => p.name === 'kaivalo-hub');
  assert(hub && hub.pm2_env.env && hub.pm2_env.env.NODE_ENV === 'production', 'NODE_ENV should be production');
});

// ============================================================================
// HTTP tests
// ============================================================================

async function httpTest() {
  await testAsync('hub responds on port 3100', () => {
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

  await testAsync('hub serves HTML content', () => {
    return new Promise((resolve, reject) => {
      let data = '';
      const req = http.get('http://localhost:3100/', res => {
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          // Check for doctype (case-insensitive) and Kai Valo content
          const hasDoctype = data.toLowerCase().includes('<!doctype html>');
          const hasKaiValo = data.includes('Kai Valo') || data.includes('kaivalo');
          if (hasDoctype && hasKaiValo) {
            resolve();
          } else {
            reject(new Error('Response should be HTML with Kai Valo content'));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => reject(new Error('Request timeout')));
    });
  });

  await testAsync('hub serves favicon', () => {
    return new Promise((resolve, reject) => {
      const req = http.get('http://localhost:3100/favicon.ico', res => {
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
}

// Run tests
httpTest().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
