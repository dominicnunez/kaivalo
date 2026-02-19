import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import http from 'node:http';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';

const npmGlobalBin = join(homedir(), '.npm-global', 'bin');
if (!process.env.PATH.includes(npmGlobalBin)) {
  process.env.PATH = `${npmGlobalBin}:${process.env.PATH}`;
}

const mechaiDir = join(resolve(import.meta.dirname, '..'), 'apps', 'mechai');
const skip = !existsSync(mechaiDir);

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data, headers: res.headers }));
    }).on('error', reject);
  });
}

describe('PM2 MechanicAI (mechai) service', { skip: skip && 'mechanic-ai directory not present' }, () => {
  it('pm2 is installed and accessible', () => {
    const result = execSync('which pm2', { encoding: 'utf-8' });
    assert(result.includes('pm2'), 'pm2 command should be found');
  });

  it('mechai process is registered in PM2', () => {
    const result = execSync('pm2 jlist', { encoding: 'utf-8' });
    const processes = JSON.parse(result);
    const mechai = processes.find(p => p.name === 'mechai');
    assert(mechai, 'mechai process should be registered in PM2');
  });

  it('mechai process is online', () => {
    const result = execSync('pm2 jlist', { encoding: 'utf-8' });
    const processes = JSON.parse(result);
    const mechai = processes.find(p => p.name === 'mechai');
    assert(mechai && mechai.pm2_env.status === 'online', 'mechai should have status "online"');
  });

  it('mechai runs build/index.js', () => {
    const result = execSync('pm2 jlist', { encoding: 'utf-8' });
    const processes = JSON.parse(result);
    const mechai = processes.find(p => p.name === 'mechai');
    assert(mechai && mechai.pm2_env.pm_exec_path.endsWith('build/index.js'),
      'mechai should run build/index.js');
  });

  it('mechai has PORT=3101 environment variable', () => {
    const result = execSync('pm2 jlist', { encoding: 'utf-8' });
    const processes = JSON.parse(result);
    const mechai = processes.find(p => p.name === 'mechai');
    const port = mechai?.pm2_env?.env?.PORT || mechai?.pm2_env?.PORT;
    assert(port === 3101 || port === '3101', 'mechai should have PORT=3101');
  });

  it('mechai has NODE_ENV=production environment variable', () => {
    const result = execSync('pm2 jlist', { encoding: 'utf-8' });
    const processes = JSON.parse(result);
    const mechai = processes.find(p => p.name === 'mechai');
    const nodeEnv = mechai?.pm2_env?.env?.NODE_ENV || mechai?.pm2_env?.NODE_ENV;
    assert(nodeEnv === 'production', 'mechai should have NODE_ENV=production');
  });

  it('mechai has a valid PID', () => {
    const result = execSync('pm2 jlist', { encoding: 'utf-8' });
    const processes = JSON.parse(result);
    const mechai = processes.find(p => p.name === 'mechai');
    assert(mechai && mechai.pid > 0, 'mechai should have a valid PID');
  });

  it('mechai responds with HTTP 200 on port 3101', async () => {
    const response = await httpGet('http://localhost:3101/mechai/');
    assert.strictEqual(response.statusCode, 200, `Expected 200, got ${response.statusCode}`);
  });

  it('mechai serves HTML content', async () => {
    const response = await httpGet('http://localhost:3101/mechai/');
    assert(response.headers['content-type'].includes('text/html'), 'Response should be HTML');
  });

  it('mechai serves MechanicAI app', async () => {
    const response = await httpGet('http://localhost:3101/mechai/');
    assert(response.body.includes('MechanicAI') || response.body.includes('mechai'),
      'Response should include MechanicAI branding');
  });
});
