import { describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { Badge, Button, Card, Container } from '../../../packages/ui/index.js';

const snippet = createRawSnippet(() => ({
	render: () => '<span>Rendered child</span>'
}));

describe('ui public api exports', () => {
	it('exports a Button component with click, type, and disabled semantics', async () => {
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

		const disabledClick = vi.fn();
		render(Button, {
			disabled: true,
			onclick: disabledClick,
			children: snippet
		});

		const disabledButton = screen.getAllByRole('button', {
			name: 'Rendered child'
		})[1];
		expect(disabledButton.hasAttribute('disabled')).toBe(true);
		expect(disabledButton.getAttribute('aria-disabled')).toBeNull();
		expect(disabledClick).not.toHaveBeenCalled();
	});

	it('exports a Badge component that renders visible status content', () => {
		render(Badge, {
			children: snippet
		});

		expect(screen.getByText('Rendered child')).toBeTruthy();
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
		expect(
			screen.getByRole('link', { name: /safe card/i }).getAttribute('href')
		).toBe('/services');
	});

	it('exports a Container component that preserves children and caller classes', () => {
		const wrapped = render(Container, {
			class: 'consumer-shell',
			children: snippet
		});

		expect(wrapped.container.firstElementChild?.className).toContain(
			'consumer-shell'
		);
		expect(wrapped.container.textContent).toContain('Rendered child');
	});
});
