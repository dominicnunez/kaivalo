import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const MECHANIC_AI_PATH = '/home/kai/pets/mechanic-ai';

// Test helper
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

// Test: mechanic-ai directory exists
test('mechanic-ai directory exists', () => {
  assert.ok(fs.existsSync(MECHANIC_AI_PATH), 'mechanic-ai directory should exist');
});

// Test: package.json exists with build script
test('package.json exists with build script', () => {
  const pkgPath = path.join(MECHANIC_AI_PATH, 'package.json');
  assert.ok(fs.existsSync(pkgPath), 'package.json should exist');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert.ok(pkg.scripts?.build, 'build script should be defined');
});

// Test: npm run build succeeds
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

// Test: build directory is created
test('build directory exists after build', () => {
  const buildPath = path.join(MECHANIC_AI_PATH, 'build');
  assert.ok(fs.existsSync(buildPath), 'build directory should exist');
});

// Test: build/index.js entry point exists
test('build/index.js entry point exists', () => {
  const indexPath = path.join(MECHANIC_AI_PATH, 'build', 'index.js');
  assert.ok(fs.existsSync(indexPath), 'build/index.js should exist');
});

// Test: build/handler.js exists (adapter-node output)
test('build/handler.js exists', () => {
  const handlerPath = path.join(MECHANIC_AI_PATH, 'build', 'handler.js');
  assert.ok(fs.existsSync(handlerPath), 'build/handler.js should exist');
});

// Test: build/client directory exists
test('build/client directory exists', () => {
  const clientPath = path.join(MECHANIC_AI_PATH, 'build', 'client');
  assert.ok(fs.existsSync(clientPath), 'build/client directory should exist');
});

// Test: build/server directory exists
test('build/server directory exists', () => {
  const serverPath = path.join(MECHANIC_AI_PATH, 'build', 'server');
  assert.ok(fs.existsSync(serverPath), 'build/server directory should exist');
});

// Test: index.js is a valid Node.js entry point
test('build/index.js is a valid entry file', () => {
  const indexPath = path.join(MECHANIC_AI_PATH, 'build', 'index.js');
  const content = fs.readFileSync(indexPath, 'utf8');
  // Should have import or export statements (ES module)
  assert.ok(
    content.includes('import') || content.includes('export'),
    'index.js should be a valid ES module'
  );
});

// Test: .svelte-kit/output exists (intermediate build output)
test('.svelte-kit/output directory exists', () => {
  const outputPath = path.join(MECHANIC_AI_PATH, '.svelte-kit', 'output');
  assert.ok(fs.existsSync(outputPath), '.svelte-kit/output should exist');
});

// Test: svelte.config.js uses adapter-node
test('svelte.config.js uses adapter-node', () => {
  const configPath = path.join(MECHANIC_AI_PATH, 'svelte.config.js');
  const content = fs.readFileSync(configPath, 'utf8');
  assert.ok(
    content.includes('adapter-node'),
    'svelte.config.js should use adapter-node'
  );
});

// Test: build has static assets
test('build has static assets in client directory', () => {
  const clientPath = path.join(MECHANIC_AI_PATH, 'build', 'client');
  const files = fs.readdirSync(clientPath, { recursive: true });
  assert.ok(files.length > 0, 'client directory should have files');
});

// Summary
console.log(`\n${passCount}/${testCount} tests passed\n`);

if (passCount !== testCount) {
  process.exit(1);
}
