import { describe, it } from 'node:test';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import assert from 'node:assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

describe('git repository initialization', () => {
  it('.git directory exists', () => {
    const gitDir = join(rootDir, '.git');
    assert(existsSync(gitDir), '.git directory should exist');
  });

  it('.git is a directory', () => {
    const gitDir = join(rootDir, '.git');
    const stat = statSync(gitDir);
    assert(stat.isDirectory(), '.git should be a directory');
  });

  it('git repo is valid', () => {
    const result = execSync('git rev-parse --is-inside-work-tree', {
    cwd: rootDir,
    encoding: 'utf-8'
    }).trim();
    assert(result === 'true', 'should be inside a git work tree');
  });

  it('git root is at correct location', () => {
    const result = execSync('git rev-parse --show-toplevel', {
    cwd: rootDir,
    encoding: 'utf-8'
    }).trim();
    assert(result === rootDir, `git root should be ${rootDir}, got ${result}`);
  });

  it('main branch exists', () => {
    const result = execSync('git branch --show-current', {
    cwd: rootDir,
    encoding: 'utf-8'
    }).trim();
    assert(result === 'main', `current branch should be "main", got "${result}"`);
  });

  it('has at least one commit', () => {
    const result = execSync('git rev-parse HEAD', {
    cwd: rootDir,
    encoding: 'utf-8'
    }).trim();
    assert(result.length === 40, 'HEAD should point to a valid commit hash');
  });
});
