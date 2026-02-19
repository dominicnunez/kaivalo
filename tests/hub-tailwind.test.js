import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const rootPath = path.resolve(import.meta.dirname, '..');
const hubPath = path.join(rootPath, 'apps/hub');
// Test tailwindcss is installed

describe('hub tailwind', () => {
  it('tailwindcss package is installed', () => {
    const tailwindPath = path.join(rootPath, 'node_modules', 'tailwindcss');
    assert.ok(fs.existsSync(tailwindPath), 'tailwindcss package should exist in node_modules');
  });

  it('@tailwindcss/vite package is installed', () => {
    const vitePath = path.join(rootPath, 'node_modules', '@tailwindcss', 'vite');
    assert.ok(fs.existsSync(vitePath), '@tailwindcss/vite package should exist for Tailwind v4');
  });

  it('app.css exists', () => {
    const cssPath = path.join(hubPath, 'src', 'app.css');
    assert.ok(fs.existsSync(cssPath), 'app.css should exist');
  });

  it('app.css imports tailwindcss', () => {
    const cssPath = path.join(hubPath, 'src', 'app.css');
    const content = fs.readFileSync(cssPath, 'utf8');
    assert.ok(content.includes('@import "tailwindcss"'), 'app.css should import tailwindcss (v4 style)');
  });

  it('vite.config.ts imports @tailwindcss/vite', () => {
    const vitePath = path.join(hubPath, 'vite.config.ts');
    const content = fs.readFileSync(vitePath, 'utf8');
    assert.ok(content.includes("from '@tailwindcss/vite'"), 'vite.config.ts should import @tailwindcss/vite');
  });

  it('vite.config.ts uses tailwindcss plugin', () => {
    const vitePath = path.join(hubPath, 'vite.config.ts');
    const content = fs.readFileSync(vitePath, 'utf8');
    assert.ok(content.includes('tailwindcss()'), 'vite.config.ts should use tailwindcss() plugin');
  });

  it('tailwindcss is version 4.x', () => {
    const pkgPath = path.join(rootPath, 'node_modules', 'tailwindcss', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.ok(pkg.version.startsWith('4.'), `tailwindcss should be v4.x, got ${pkg.version}`);
  });
});
