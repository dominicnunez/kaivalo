import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');
const configPath = resolve(projectRoot, 'infrastructure/nginx/kaivalo.com');
const installPath = resolve(projectRoot, 'infrastructure/nginx/install.sh');
const installContent = readFileSync(installPath, 'utf8');
// ============================================================================
// Install script tests
// ============================================================================

describe('nginx install', () => {
  it('install.sh script exists', () => {
    assert(existsSync(installPath), 'install.sh should exist');
  });

  it('install.sh is executable', () => {
    const stats = statSync(installPath);
    const isExecutable = (stats.mode & 0o100) !== 0;
    assert(isExecutable, 'install.sh should be executable');
  });

  it('install.sh has bash shebang', () => {
    assert(installContent.startsWith('#!/bin/bash'), 'should start with bash shebang');
  });

  it('install.sh checks for root/sudo', () => {
    assert(installContent.includes('EUID') || installContent.includes('root'), 'should check for root privileges');
  });

  it('install.sh copies config to sites-available', () => {
    assert(installContent.includes('/etc/nginx/sites-available'), 'should reference sites-available');
  });

  it('install.sh creates symlink to sites-enabled', () => {
    assert(installContent.includes('ln -s'), 'should create symlink');
    assert(installContent.includes('/etc/nginx/sites-enabled'), 'should reference sites-enabled');
  });

  it('install.sh runs nginx -t', () => {
    assert(installContent.includes('nginx -t'), 'should test nginx configuration');
  });

  it('install.sh provides next steps for SSL', () => {
    assert(installContent.includes('certbot'), 'should mention certbot');
  });

  it('nginx is installed on this system', () => {
    try {
    execSync('which nginx', { encoding: 'utf8' });
    } catch {
    throw new Error('nginx is not installed');
    }
  });

  it('config has all required proxy_pass directives', () => {
    const content = readFileSync(configPath, 'utf8');
    assert(content.includes('proxy_pass http://127.0.0.1:3100'), 'should have proxy_pass for hub (3100)');
    assert(content.includes('proxy_pass http://127.0.0.1:3101'), 'should have proxy_pass for mechai (3101)');
  });

  it('config uses valid server_name patterns', () => {
    const content = readFileSync(configPath, 'utf8');
    // Check for valid domain names
    assert(content.includes('server_name kaivalo.com'), 'should have kaivalo.com');
    assert(content.includes('server_name mechai.kaivalo.com'), 'should have mechai.kaivalo.com');
    assert(content.includes('server_name *.kaivalo.com'), 'should have wildcard');
  });

  it('sites-available directory exists on system', () => {
    assert(existsSync('/etc/nginx/sites-available'), 'sites-available should exist');
  });

  it('sites-enabled directory exists on system', () => {
    assert(existsSync('/etc/nginx/sites-enabled'), 'sites-enabled should exist');
  });
});
