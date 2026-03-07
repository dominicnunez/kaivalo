import { describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { Badge, Button, Card, Container } from '../../../packages/ui/index.js';

const snippet = createRawSnippet(() => ({
	render: () => '<span>Rendered child</span>'
}));

describe('ui public api exports', () => {
	it('exports a Button component with click and type behavior', async () => {
		const onClick = vi.fn();
		render(Button, {
			type: 'submit',
			onclick: onClick,
			children: snippet
		});

		const button = screen.getByRole('button', { name: 'Rendered child' });
		expect(button.getAttribute('type')).toBe('submit');
		await fireEvent.click(button);
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it('exports a Badge component that renders label content', () => {
		render(Badge, {
			children: snippet
		});

		expect(screen.getByText('Rendered child').tagName).toBe('SPAN');
	});

	it('exports a Card component that only links on safe href values', () => {
		const unsafeCard = render(Card, {
			variant: 'link',
			href: 'javascript:alert(1)',
			header: 'Unsafe card',
			children: snippet
		});
		expect(unsafeCard.container.querySelector('a')).toBeNull();

		render(Card, {
			variant: 'link',
			href: '/services',
			header: 'Safe card',
			children: snippet
		});
		expect(screen.getByRole('link', { name: /safe card/i }).getAttribute('href')).toBe('/services');
	});

	it('exports a Container component with public runtime marker', () => {
		const wrapped = render(Container, {
			children: snippet
		});

		expect(wrapped.container.querySelector('[data-ui="container"]')).not.toBeNull();
		expect(wrapped.container.textContent).toContain('Rendered child');
	});
});
