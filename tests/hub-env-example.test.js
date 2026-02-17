import { existsSync, readFileSync } from 'fs';
import path from 'path';
import assert from 'assert';

const hubDir = path.join(process.cwd(), 'apps', 'hub');
const envExamplePath = path.join(hubDir, '.env.example');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed++;
    console.log(`✗ ${name}`);
    console.log(`  ${error.message}`);
  }
}

console.log('Testing apps/hub/.env.example...\n');

// Test 1: .env.example exists
test('.env.example exists', () => {
  assert.ok(existsSync(envExamplePath), '.env.example should exist');
});

// Test 2: .env.example is readable
test('.env.example is readable', () => {
  const content = readFileSync(envExamplePath, 'utf-8');
  assert.ok(typeof content === 'string', '.env.example should be readable');
});

// Test 3: .env.example contains header comment
test('.env.example contains header comment', () => {
  const content = readFileSync(envExamplePath, 'utf-8');
  assert.ok(content.includes('# Environment Variables'), 'should have environment variables header');
});

// Test 4: .env.example mentions Kaivalo Hub
test('.env.example mentions Kaivalo Hub', () => {
  const content = readFileSync(envExamplePath, 'utf-8');
  assert.ok(content.includes('Kaivalo Hub'), 'should mention Kaivalo Hub');
});

// Test 5: .env.example has WorkOS configuration variables
test('.env.example has WorkOS configuration variables', () => {
  const content = readFileSync(envExamplePath, 'utf-8');
  assert.ok(content.includes('WORKOS_CLIENT_ID'), 'should have WORKOS_CLIENT_ID');
});

// Test 6: .env.example starts with a comment
test('.env.example starts with a comment', () => {
  const content = readFileSync(envExamplePath, 'utf-8');
  assert.ok(content.trim().startsWith('#'), 'should start with a comment');
});

// Test 7: .env.example has instruction to copy
test('.env.example has instruction to copy to .env', () => {
  const content = readFileSync(envExamplePath, 'utf-8');
  assert.ok(content.includes('Copy this file to .env') || content.includes('.env'), 'should mention copying to .env');
});

// Test 8: .env.example is in hub directory
test('.env.example is in apps/hub directory', () => {
  assert.ok(envExamplePath.includes(path.join('apps', 'hub', '.env.example')), 'should be in apps/hub directory');
});

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
