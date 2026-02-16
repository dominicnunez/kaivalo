import { describe, it, expect } from 'vitest';
import { load } from './+page';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Landing page metadata', () => {
	it('should have correct meta description', () => {
		const result = load();

		expect(result.meta.description).toBe(
			'Simple tools for complicated problems. One account, every tool — sign up once and go.'
		);
	});

	it('should have correct meta title', () => {
		const result = load();

		expect(result.meta.title).toBe('Kai Valo | Tools That Solve Things');
	});

	it('should have correct meta URL', () => {
		const result = load();

		expect(result.meta.url).toBe('https://kaivalo.com');
	});
});

describe('Hero section spacing', () => {
	const pageContent = readFileSync(join(__dirname, '+page.svelte'), 'utf-8');

	it('should have tightened bottom padding (pb-6 and sm:pb-8)', () => {
		expect(pageContent).toContain('pb-6');
		expect(pageContent).toContain('sm:pb-8');
		expect(pageContent).not.toContain('pb-8 sm:pb-12');
	});

	it('should have reduced min-height (md:min-h-[40vh])', () => {
		expect(pageContent).toContain('md:min-h-[40vh]');
		expect(pageContent).not.toContain('md:min-h-[50vh]');
	});

	it('should preserve top padding (pt-12 sm:pt-16)', () => {
		expect(pageContent).toContain('pt-12');
		expect(pageContent).toContain('sm:pt-16');
	});
});

describe('Services section spacing', () => {
	const pageContent = readFileSync(join(__dirname, '+page.svelte'), 'utf-8');

	it('should have tightened section padding (py-8 sm:py-12)', () => {
		// Extract only the services section content
		const servicesStart = pageContent.indexOf('<!-- ════════ SERVICES ════════ -->');
		const servicesEnd = pageContent.indexOf('<!-- ════════ ABOUT ════════ -->');
		const servicesContent = pageContent.substring(servicesStart, servicesEnd);

		// Check for the tightened padding classes in services section
		expect(servicesContent).toContain('py-8 sm:py-12');
		expect(servicesContent).not.toContain('py-10 sm:py-16');
	});

	it('should have tightened section header margin (mb-8 sm:mb-10)', () => {
		// Extract only the services section content
		const servicesStart = pageContent.indexOf('<!-- ════════ SERVICES ════════ -->');
		const servicesEnd = pageContent.indexOf('<!-- ════════ ABOUT ════════ -->');
		const servicesContent = pageContent.substring(servicesStart, servicesEnd);

		// Check for the tightened margin classes in services section
		expect(servicesContent).toContain('mb-8 sm:mb-10');
		expect(servicesContent).not.toContain('mb-10 sm:mb-16');
	});
});

describe('About section spacing', () => {
	const pageContent = readFileSync(join(__dirname, '+page.svelte'), 'utf-8');

	it('should have tightened section padding (py-8 sm:py-12)', () => {
		// Extract only the about section content
		const aboutStart = pageContent.indexOf('<!-- ════════ ABOUT ════════ -->');
		const aboutEnd = pageContent.indexOf('<!-- ════════ FOOTER ════════ -->');
		const aboutContent = pageContent.substring(aboutStart, aboutEnd);

		// Check for the tightened padding classes in about section
		expect(aboutContent).toContain('py-8 sm:py-12');
		expect(aboutContent).not.toContain('py-10 sm:py-16');
	});
});
