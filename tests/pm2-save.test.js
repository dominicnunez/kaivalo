import { existsSync, readFileSync, statSync } from 'fs';
import { execSync } from 'child_process';
import assert from 'assert';
import { homedir } from 'os';
import { join } from 'path';

// Simple test helper
function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err.message}`);
    return false;
  }
}

console.log('\n=== PM2 Save Configuration Tests ===\n');

const pm2DumpPath = join(homedir(), '.pm2', 'dump.pm2');

// Test: PM2 dump file exists
test('pm2 dump file exists at ~/.pm2/dump.pm2', () => {
  assert.strictEqual(existsSync(pm2DumpPath), true, 'dump.pm2 should exist');
});

// Test: Dump file is not empty
test('pm2 dump file is not empty', () => {
  const content = readFileSync(pm2DumpPath, 'utf-8');
  assert.ok(content.length > 0, 'dump.pm2 should not be empty');
});

// Test: Dump file contains valid JSON
let dumpData = [];
test('pm2 dump file contains valid JSON array', () => {
  const content = readFileSync(pm2DumpPath, 'utf-8');
  dumpData = JSON.parse(content);
  assert.ok(Array.isArray(dumpData), 'dump.pm2 should be a JSON array');
});

// Test: kaivalo-hub is saved in dump
test('kaivalo-hub is saved in PM2 dump', () => {
  const hubProcess = dumpData.find(p => p.name === 'kaivalo-hub');
  assert.ok(hubProcess, 'kaivalo-hub should be in dump.pm2');
});

// Test: mechai is saved in dump
test('mechai is saved in PM2 dump', () => {
  const mechaiProcess = dumpData.find(p => p.name === 'mechai');
  assert.ok(mechaiProcess, 'mechai should be in dump.pm2');
});

// Test: kaivalo-hub has correct port in dump
test('kaivalo-hub has PORT 3100 in saved config', () => {
  const hubProcess = dumpData.find(p => p.name === 'kaivalo-hub');
  assert.ok(hubProcess, 'kaivalo-hub should exist');
  const env = hubProcess.pm2_env || hubProcess.env || {};
  assert.strictEqual(String(env.PORT), '3100', 'PORT should be 3100');
});

// Test: mechai has correct port in dump
test('mechai has PORT 3101 in saved config', () => {
  const mechaiProcess = dumpData.find(p => p.name === 'mechai');
  assert.ok(mechaiProcess, 'mechai should exist');
  const env = mechaiProcess.pm2_env || mechaiProcess.env || {};
  assert.strictEqual(String(env.PORT), '3101', 'PORT should be 3101');
});

// Test: pm2 save command succeeds (can be run again)
test('pm2 save command succeeds', () => {
  const output = execSync('pm2 save 2>&1', { encoding: 'utf-8' });
  assert.ok(output.includes('Successfully saved') || output.includes('Saving current process list'),
    'pm2 save should succeed');
});

// Test: PM2 jlist shows both processes
test('pm2 jlist shows kaivalo-hub and mechai running', () => {
  const output = execSync('pm2 jlist', { encoding: 'utf-8' });
  const processes = JSON.parse(output);
  const hubProcess = processes.find(p => p.name === 'kaivalo-hub');
  const mechaiProcess = processes.find(p => p.name === 'mechai');
  assert.ok(hubProcess, 'kaivalo-hub should be in pm2 jlist');
  assert.ok(mechaiProcess, 'mechai should be in pm2 jlist');
});

// Test: Both processes are online
test('both kaivalo-hub and mechai are online', () => {
  const output = execSync('pm2 jlist', { encoding: 'utf-8' });
  const processes = JSON.parse(output);
  const hubProcess = processes.find(p => p.name === 'kaivalo-hub');
  const mechaiProcess = processes.find(p => p.name === 'mechai');
  assert.strictEqual(hubProcess.pm2_env.status, 'online', 'kaivalo-hub should be online');
  assert.strictEqual(mechaiProcess.pm2_env.status, 'online', 'mechai should be online');
});

// Test: Dump file was modified recently (within last 5 minutes)
test('pm2 dump file was modified recently', () => {
  const { mtimeMs } = statSync(pm2DumpPath);
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
  assert.ok(mtimeMs > fiveMinutesAgo, 'dump.pm2 should be modified recently');
});

console.log('\n=== PM2 Save Configuration Tests Complete ===\n');
