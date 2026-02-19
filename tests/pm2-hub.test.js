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
// ============================================================================
// PM2 status tests
// ============================================================================

describe('pm2 hub', () => {
  it('pm2 is installed', () => {
    try {
    execSync('which pm2', { encoding: 'utf8' });
    } catch {
    throw new Error('pm2 is not installed');
    }
  });

  it('kaivalo-hub is registered in pm2', () => {
    const output = execSync('pm2 jlist', { encoding: 'utf8' });
    const processes = JSON.parse(output);
    const hub = processes.find(p => p.name === 'kaivalo-hub');
    assert(hub, 'kaivalo-hub should be in pm2 process list');
  });

  it('kaivalo-hub is online', () => {
    const output = execSync('pm2 jlist', { encoding: 'utf8' });
    const processes = JSON.parse(output);
    const hub = processes.find(p => p.name === 'kaivalo-hub');
    assert(hub && hub.pm2_env.status === 'online', 'kaivalo-hub should be online');
  });

  it('kaivalo-hub is running with correct script', () => {
    const output = execSync('pm2 jlist', { encoding: 'utf8' });
    const processes = JSON.parse(output);
    const hub = processes.find(p => p.name === 'kaivalo-hub');
    assert(hub && hub.pm2_env.pm_exec_path.includes('build/index.js'), 'should run build/index.js');
  });

  it('kaivalo-hub has PORT 3100 in env', () => {
    const output = execSync('pm2 jlist', { encoding: 'utf8' });
    const processes = JSON.parse(output);
    const hub = processes.find(p => p.name === 'kaivalo-hub');
    assert(hub && hub.pm2_env.env && hub.pm2_env.env.PORT === 3100, 'PORT should be 3100');
  });

  it('kaivalo-hub has NODE_ENV production', () => {
    const output = execSync('pm2 jlist', { encoding: 'utf8' });
    const processes = JSON.parse(output);
    const hub = processes.find(p => p.name === 'kaivalo-hub');
    assert(hub && hub.pm2_env.env && hub.pm2_env.env.NODE_ENV === 'production', 'NODE_ENV should be production');
  });
});
