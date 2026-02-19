import { describe, it } from 'node:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import assert from 'node:assert';
import { homedir } from 'node:os';
import { join } from 'node:path';

const npmGlobalBin = join(homedir(), '.npm-global', 'bin');
if (!process.env.PATH.includes(npmGlobalBin)) {
  process.env.PATH = `${npmGlobalBin}:${process.env.PATH}`;
}
const pm2DumpPath = join(homedir(), '.pm2', 'dump.pm2');
let dumpData;
// Test: PM2 dump file exists

describe('Test: PM2 save configuration', () => {
  it('pm2 dump file exists at ~/.pm2/dump.pm2', () => {
    assert.strictEqual(existsSync(pm2DumpPath), true, 'dump.pm2 should exist');
  });

  it('pm2 dump file is not empty', () => {
    const content = readFileSync(pm2DumpPath, 'utf-8');
    assert.ok(content.length > 0, 'dump.pm2 should not be empty');
  });

  it('pm2 dump file contains valid JSON array', () => {
    const content = readFileSync(pm2DumpPath, 'utf-8');
    dumpData = JSON.parse(content);
    assert.ok(Array.isArray(dumpData), 'dump.pm2 should be a JSON array');
  });

  it('kaivalo-hub is saved in PM2 dump', () => {
    const hubProcess = dumpData.find(p => p.name === 'kaivalo-hub');
    assert.ok(hubProcess, 'kaivalo-hub should be in dump.pm2');
  });

  it('kaivalo-hub has PORT 3100 in saved config', () => {
    const hubProcess = dumpData.find(p => p.name === 'kaivalo-hub');
    assert.ok(hubProcess, 'kaivalo-hub should exist');
    const env = hubProcess.pm2_env || hubProcess.env || {};
    assert.strictEqual(String(env.PORT), '3100', 'PORT should be 3100');
  });

  it('mechai is saved in PM2 dump', () => {
    const mechaiProcess = dumpData.find(p => p.name === 'mechai');
    assert.ok(mechaiProcess, 'mechai should be in dump.pm2');
  });

  it('mechai has PORT 3101 in saved config', () => {
    const mechaiProcess = dumpData.find(p => p.name === 'mechai');
    assert.ok(mechaiProcess, 'mechai should exist');
    const env = mechaiProcess.pm2_env || mechaiProcess.env || {};
    assert.strictEqual(String(env.PORT), '3101', 'PORT should be 3101');
  });

  it('pm2 save command succeeds', () => {
    const output = execSync('pm2 save 2>&1', { encoding: 'utf-8' });
    assert.ok(output.includes('Successfully saved') || output.includes('Saving current process list'),
    'pm2 save should succeed');
  });

  it('pm2 jlist shows kaivalo-hub running', () => {
    const output = execSync('pm2 jlist', { encoding: 'utf-8' });
    const processes = JSON.parse(output);
    const hubProcess = processes.find(p => p.name === 'kaivalo-hub');
    assert.ok(hubProcess, 'kaivalo-hub should be in pm2 jlist');
    assert.strictEqual(hubProcess.pm2_env.status, 'online', 'kaivalo-hub should be online');
  });

  it('pm2 dump file was modified recently', () => {
    const { mtimeMs } = statSync(pm2DumpPath);
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    assert.ok(mtimeMs > fiveMinutesAgo, 'dump.pm2 should be modified recently');
  });
});
