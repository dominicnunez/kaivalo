import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const projectRoot = resolve(import.meta.dirname, '..');
const configPath = resolve(projectRoot, 'infrastructure/nginx/kaivalo.com');
const installPath = resolve(projectRoot, 'infrastructure/nginx/install.sh');

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

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

console.log('\nTesting nginx installation setup...\n');

// ============================================================================
// Install script tests
// ============================================================================

test('install.sh script exists', () => {
  assert(existsSync(installPath), 'install.sh should exist');
});

test('install.sh is executable', () => {
  const stats = statSync(installPath);
  const isExecutable = (stats.mode & 0o100) !== 0;
  assert(isExecutable, 'install.sh should be executable');
});

let installContent = '';
if (existsSync(installPath)) {
  installContent = readFileSync(installPath, 'utf8');
}

test('install.sh has bash shebang', () => {
  assert(installContent.startsWith('#!/bin/bash'), 'should start with bash shebang');
});

test('install.sh checks for root/sudo', () => {
  assert(installContent.includes('EUID') || installContent.includes('root'), 'should check for root privileges');
});

test('install.sh copies config to sites-available', () => {
  assert(installContent.includes('/etc/nginx/sites-available'), 'should reference sites-available');
});

test('install.sh creates symlink to sites-enabled', () => {
  assert(installContent.includes('ln -s'), 'should create symlink');
  assert(installContent.includes('/etc/nginx/sites-enabled'), 'should reference sites-enabled');
});

test('install.sh runs nginx -t', () => {
  assert(installContent.includes('nginx -t'), 'should test nginx configuration');
});

test('install.sh provides next steps for SSL', () => {
  assert(installContent.includes('certbot'), 'should mention certbot');
});

// ============================================================================
// Nginx config syntax validation (without sudo)
// ============================================================================

test('nginx is installed on this system', () => {
  try {
    execSync('which nginx', { encoding: 'utf8' });
  } catch {
    throw new Error('nginx is not installed');
  }
});

test('nginx config file has valid syntax structure', () => {
  const content = readFileSync(configPath, 'utf8');

  // Count opening and closing braces
  const openBraces = (content.match(/{/g) || []).length;
  const closeBraces = (content.match(/}/g) || []).length;
  assert(openBraces === closeBraces, `Brace mismatch: ${openBraces} open vs ${closeBraces} close`);

  // Check for essential directives
  assert(content.includes('server {'), 'should have server blocks');
  assert(content.includes('listen '), 'should have listen directives');
  assert(content.includes('server_name '), 'should have server_name directives');
  assert(content.includes('location '), 'should have location blocks');
});

test('config has matching server blocks', () => {
  const content = readFileSync(configPath, 'utf8');
  // Count 'server {' occurrences (uncommented)
  const serverBlocks = content
    .split('\n')
    .filter(line => !line.trim().startsWith('#'))
    .join('\n')
    .match(/\bserver\s*{/g) || [];

  // Should have at least 3 server blocks: main, mechai, catch-all
  assert(serverBlocks.length >= 3, `Expected at least 3 server blocks, found ${serverBlocks.length}`);
});

test('config has all required proxy_pass directives', () => {
  const content = readFileSync(configPath, 'utf8');
  assert(content.includes('proxy_pass http://127.0.0.1:3100'), 'should have proxy_pass for hub (3100)');
  assert(content.includes('proxy_pass http://127.0.0.1:3101'), 'should have proxy_pass for mechai (3101)');
});

test('config uses valid server_name patterns', () => {
  const content = readFileSync(configPath, 'utf8');
  // Check for valid domain names
  assert(content.includes('server_name kaivalo.com'), 'should have kaivalo.com');
  assert(content.includes('server_name mechai.kaivalo.com'), 'should have mechai.kaivalo.com');
  assert(content.includes('server_name *.kaivalo.com'), 'should have wildcard');
});

// ============================================================================
// Integration readiness tests
// ============================================================================

test('sites-available directory exists on system', () => {
  assert(existsSync('/etc/nginx/sites-available'), 'sites-available should exist');
});

test('sites-enabled directory exists on system', () => {
  assert(existsSync('/etc/nginx/sites-enabled'), 'sites-enabled should exist');
});

// ============================================================================
// Summary
// ============================================================================

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
