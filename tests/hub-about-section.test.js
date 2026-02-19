import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const pagePath = path.join(projectRoot, 'apps/hub/src/routes/+page.svelte');
const pageContent = fs.readFileSync(pagePath, 'utf-8');
// Section structure

describe('hub about section', () => {
  it('about section has id="about"', () => {
    assert.ok(pageContent.includes('id="about"'));
  });

  it('about section is a <section> element', () => {
    assert.ok(pageContent.includes('<section id="about"'));
  });

  it('has avatar with K initial', () => {
    // Avatar shows "K" letter
    assert.ok(pageContent.includes('>K<') || pageContent.includes('>K </'));
  });

  it('avatar has gradient background', () => {
    assert.ok(pageContent.includes('linear-gradient'));
  });

  it('avatar has rounded corners', () => {
    assert.ok(pageContent.includes('rounded-2xl') || pageContent.includes('rounded-full'));
  });

  it('has Kai Valo name', () => {
    assert.ok(pageContent.includes('Kai Valo'));
  });

  it('has Helsinki location', () => {
    assert.ok(pageContent.includes('Helsinki'));
  });

  it('has about copy about building tools', () => {
    assert.ok(pageContent.includes('build tools') || pageContent.includes('cut through complexity'));
  });

  it('has copy about information asymmetry', () => {
    assert.ok(pageContent.includes('Information asymmetry') || pageContent.includes('solvable problem'));
  });

  it('uses grid layout', () => {
    assert.ok(pageContent.includes('grid') && pageContent.includes('md:grid-cols-12'));
  });

  it('uses Container component', () => {
    assert.ok(pageContent.includes('<Container'));
  });

  it('has responsive typography', () => {
    assert.ok(pageContent.includes('sm:text-') || pageContent.includes('md:text-'));
  });
});
