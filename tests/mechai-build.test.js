/**
 * Test: MechanicAI build verification
 * Validates that mechanic-ai builds successfully with adapter-node.
 * Skips all tests if mechanic-ai directory is not present.
 */

import { existsSync } from 'fs';
import { resolve, join } from 'path';

const MECHANIC_AI_PATH = join(resolve(import.meta.dirname, '..'), 'apps', 'mechai');

if (!existsSync(MECHANIC_AI_PATH)) {
  console.log('\nMechanicAI Build Tests\n');
  console.log('- All tests skipped (mechanic-ai directory not present)');
  console.log('\n0/0 tests passed (12 skipped)\n');
  process.exit(0);
}

// Only run tests if directory exists
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

let testCount = 0;
let passCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
  }
}

console.log('\nMechanicAI Build Tests\n');

test('mechanic-ai directory exists', () => {
  assert.ok(fs.existsSync(MECHANIC_AI_PATH), 'mechanic-ai directory should exist');
});

test('package.json exists with build script', () => {
  const pkgPath = path.join(MECHANIC_AI_PATH, 'package.json');
  assert.ok(fs.existsSync(pkgPath), 'package.json should exist');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert.ok(pkg.scripts?.build, 'build script should be defined');
});

test('npm run build succeeds', () => {
  try {
    execSync('npm run build', {
      cwd: MECHANIC_AI_PATH,
      stdio: 'pipe',
      timeout: 120000
    });
    assert.ok(true, 'build should succeed');
  } catch (error) {
    assert.fail(`Build failed: ${error.message}`);
  }
});

test('build directory exists after build', () => {
  const buildPath = path.join(MECHANIC_AI_PATH, 'build');
  assert.ok(fs.existsSync(buildPath), 'build directory should exist');
});

test('build/index.js entry point exists', () => {
  const indexPath = path.join(MECHANIC_AI_PATH, 'build', 'index.js');
  assert.ok(fs.existsSync(indexPath), 'build/index.js should exist');
});

test('build/handler.js exists', () => {
  const handlerPath = path.join(MECHANIC_AI_PATH, 'build', 'handler.js');
  assert.ok(fs.existsSync(handlerPath), 'build/handler.js should exist');
});

test('build/client directory exists', () => {
  const clientPath = path.join(MECHANIC_AI_PATH, 'build', 'client');
  assert.ok(fs.existsSync(clientPath), 'build/client directory should exist');
});

test('build/server directory exists', () => {
  const serverPath = path.join(MECHANIC_AI_PATH, 'build', 'server');
  assert.ok(fs.existsSync(serverPath), 'build/server directory should exist');
});

test('build/index.js is a valid entry file', () => {
  const indexPath = path.join(MECHANIC_AI_PATH, 'build', 'index.js');
  const content = fs.readFileSync(indexPath, 'utf8');
  assert.ok(
    content.includes('import') || content.includes('export'),
    'index.js should be a valid ES module'
  );
});

test('.svelte-kit/output directory exists', () => {
  const outputPath = path.join(MECHANIC_AI_PATH, '.svelte-kit', 'output');
  assert.ok(fs.existsSync(outputPath), '.svelte-kit/output should exist');
});

test('svelte.config.js uses adapter-node', () => {
  const configPath = path.join(MECHANIC_AI_PATH, 'svelte.config.js');
  const content = fs.readFileSync(configPath, 'utf8');
  assert.ok(
    content.includes('adapter-node'),
    'svelte.config.js should use adapter-node'
  );
});

test('build has static assets in client directory', () => {
  const clientPath = path.join(MECHANIC_AI_PATH, 'build', 'client');
  const files = fs.readdirSync(clientPath, { recursive: true });
  assert.ok(files.length > 0, 'client directory should have files');
});

console.log(`\n${passCount}/${testCount} tests passed\n`);

if (passCount !== testCount) {
  process.exit(1);
}
