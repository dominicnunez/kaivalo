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
