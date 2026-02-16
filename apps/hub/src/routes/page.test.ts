import { describe, it, expect } from 'vitest';
import { load } from './+page';

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
