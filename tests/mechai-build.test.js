import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const MECHANIC_AI_PATH = path.join(path.resolve(import.meta.dirname, '..'), 'apps', 'mechai');
const skip = !fs.existsSync(MECHANIC_AI_PATH);

describe('MechanicAI build verification', { skip: skip && 'mechanic-ai directory not present' }, () => {
  it('mechanic-ai directory exists', () => {
    assert.ok(fs.existsSync(MECHANIC_AI_PATH), 'mechanic-ai directory should exist');
  });

  it('package.json exists with build script', () => {
    const pkgPath = path.join(MECHANIC_AI_PATH, 'package.json');
    assert.ok(fs.existsSync(pkgPath), 'package.json should exist');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.ok(pkg.scripts?.build, 'build script should be defined');
  });

  it('npm run build succeeds', () => {
    execSync('npm run build', {
      cwd: MECHANIC_AI_PATH,
      stdio: 'pipe',
      timeout: 120000
    });
  });

  it('build directory exists after build', () => {
    const buildPath = path.join(MECHANIC_AI_PATH, 'build');
    assert.ok(fs.existsSync(buildPath), 'build directory should exist');
  });

  it('build/index.js entry point exists', () => {
    const indexPath = path.join(MECHANIC_AI_PATH, 'build', 'index.js');
    assert.ok(fs.existsSync(indexPath), 'build/index.js should exist');
  });

  it('build/handler.js exists', () => {
    const handlerPath = path.join(MECHANIC_AI_PATH, 'build', 'handler.js');
    assert.ok(fs.existsSync(handlerPath), 'build/handler.js should exist');
  });

  it('build/client directory exists', () => {
    const clientPath = path.join(MECHANIC_AI_PATH, 'build', 'client');
    assert.ok(fs.existsSync(clientPath), 'build/client directory should exist');
  });

  it('build/server directory exists', () => {
    const serverPath = path.join(MECHANIC_AI_PATH, 'build', 'server');
    assert.ok(fs.existsSync(serverPath), 'build/server directory should exist');
  });

  it('build/index.js is a valid entry file', () => {
    const indexPath = path.join(MECHANIC_AI_PATH, 'build', 'index.js');
    const content = fs.readFileSync(indexPath, 'utf8');
    assert.ok(
      content.includes('import') || content.includes('export'),
      'index.js should be a valid ES module'
    );
  });

  it('.svelte-kit/output directory exists', () => {
    const outputPath = path.join(MECHANIC_AI_PATH, '.svelte-kit', 'output');
    assert.ok(fs.existsSync(outputPath), '.svelte-kit/output should exist');
  });

  it('svelte.config.js uses adapter-node', () => {
    const configPath = path.join(MECHANIC_AI_PATH, 'svelte.config.js');
    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(
      content.includes('adapter-node'),
      'svelte.config.js should use adapter-node'
    );
  });

  it('build has static assets in client directory', () => {
    const clientPath = path.join(MECHANIC_AI_PATH, 'build', 'client');
    const files = fs.readdirSync(clientPath, { recursive: true });
    assert.ok(files.length > 0, 'client directory should have files');
  });
});
