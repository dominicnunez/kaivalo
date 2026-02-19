import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const pagePath = path.join(projectRoot, 'apps/hub/src/routes/+page.svelte');
const pageContent = fs.readFileSync(pagePath, 'utf-8');
// Section structure

describe('hub services grid', () => {
  it('services section has id="services"', () => {
    assert.ok(pageContent.includes('id="services"'));
  });

  it('services section is a <section> element', () => {
    assert.ok(pageContent.includes('<section id="services"'));
  });

  it('services section has dots-bg pattern', () => {
    assert.ok(pageContent.includes('dots-bg'));
  });

  it('has responsive grid layout', () => {
    assert.ok(pageContent.includes('grid'));
    assert.ok(pageContent.includes('grid-cols-1'));
  });

  it('has sm:grid-cols-2 for tablet', () => {
    assert.ok(pageContent.includes('sm:grid-cols-2'));
  });

  it('has Services label', () => {
    assert.ok(pageContent.includes('Services'));
  });

  it('has section heading', () => {
    assert.ok(pageContent.includes('<h2'));
  });

  it('section heading uses font-display', () => {
    const h2Match = pageContent.match(/<h2[^>]*class="[^"]*font-display/);
    assert.ok(h2Match, 'h2 should use font-display class');
  });

  it('has services array', () => {
    assert.ok(pageContent.includes('const services'));
  });

  it('services include Auto Repair Decoder', () => {
    assert.ok(pageContent.includes('Auto Repair Decoder'));
  });

  it('services include Wrench icon', () => {
    assert.ok(pageContent.includes('Wrench'));
  });

  it('services include Sparkles icon', () => {
    assert.ok(pageContent.includes('Sparkles'));
  });

  it('services have status field', () => {
    assert.ok(pageContent.includes("status:"));
  });

  it('services have description field', () => {
    assert.ok(pageContent.includes("description:"));
  });

  it('services have link field', () => {
    assert.ok(pageContent.includes("link:"));
  });

  it('has live/coming-soon conditional rendering', () => {
    assert.ok(pageContent.includes('isLive') || pageContent.includes("status === 'live'"));
  });

  it('card-glow class for hover effects', () => {
    assert.ok(pageContent.includes('card-glow'));
  });

  it('cards have rounded-xl corners', () => {
    assert.ok(pageContent.includes('rounded-xl'));
  });

  it('cards have border', () => {
    assert.ok(pageContent.includes('border'));
  });

  it('uses Container component', () => {
    assert.ok(pageContent.includes('<Container'));
  });

  it('has dynamic icon rendering', () => {
    assert.ok(pageContent.includes('svelte:component') || pageContent.includes('service.icon'));
  });
});
