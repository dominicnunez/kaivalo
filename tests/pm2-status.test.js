import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import http from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';

const npmGlobalBin = join(homedir(), '.npm-global', 'bin');
if (!process.env.PATH.includes(npmGlobalBin)) {
  process.env.PATH = `${npmGlobalBin}:${process.env.PATH}`;
}
// Get process list once
const pm2Output = execSync('pm2 jlist', { encoding: 'utf8' });
const processes = JSON.parse(pm2Output);
// ============================================================================
// PM2 general status tests
// ============================================================================

describe('Test: PM2 status verification', () => {
  it('pm2 is running and accessible', () => {
    const version = execSync('pm2 --version', { encoding: 'utf8' }).trim();
    assert(version.length > 0, 'pm2 should return a version');
  });

  it('pm2 has registered processes', () => {
    assert(processes.length > 0, 'pm2 should have at least one process');
  });

  it('kaivalo-hub is in pm2 process list', () => {
    const hub = processes.find(p => p.name === 'kaivalo-hub');
    assert(hub, 'kaivalo-hub should be registered in pm2');
  });

  it('kaivalo-hub status is online', () => {
    const hub = processes.find(p => p.name === 'kaivalo-hub');
    assert(hub && hub.pm2_env.status === 'online', 'kaivalo-hub should be online');
  });

  it('kaivalo-hub has a valid PID', () => {
    const hub = processes.find(p => p.name === 'kaivalo-hub');
    assert(hub && hub.pid > 0, 'kaivalo-hub should have a valid PID');
  });

  it('kaivalo-hub runs build/index.js', () => {
    const hub = processes.find(p => p.name === 'kaivalo-hub');
    assert(
    hub && hub.pm2_env.pm_exec_path.includes('build/index.js'),
    'kaivalo-hub should run build/index.js'
    );
  });

  it('kaivalo-hub is configured for port 3100', () => {
    const hub = processes.find(p => p.name === 'kaivalo-hub');
    const port = hub?.pm2_env?.env?.PORT ?? hub?.pm2_env?.PORT;
    assert(String(port) === '3100', `kaivalo-hub PORT should be 3100, got ${port}`);
  });

  it('kaivalo-hub is in production mode', () => {
    const hub = processes.find(p => p.name === 'kaivalo-hub');
    const nodeEnv = hub?.pm2_env?.env?.NODE_ENV ?? hub?.pm2_env?.NODE_ENV;
    assert(nodeEnv === 'production', 'kaivalo-hub NODE_ENV should be production');
  });

  it('kaivalo-hub has zero or low restart count', () => {
    const hub = processes.find(p => p.name === 'kaivalo-hub');
    assert(
    hub && hub.pm2_env.restart_time < 10,
    `kaivalo-hub should have low restarts, got ${hub?.pm2_env?.restart_time}`
    );
  });

  it('kaivalo-hub is using memory', () => {
    const hub = processes.find(p => p.name === 'kaivalo-hub');
    assert(hub && hub.monit.memory > 0, 'kaivalo-hub should be using memory (indicates running)');
  });

  it('kaivalo-hub responds on port 3100', async () => {
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

  it('kaivalo-hub serves landing page HTML', async () => {
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
});
