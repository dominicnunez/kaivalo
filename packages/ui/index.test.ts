import { describe, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from '@testing-library/svelte';
import { Badge, Button, Card, Container } from './index.ts';

const snippet = createRawSnippet(() => ({
	render: () => '<span>Rendered child</span>'
}));

describe('@kaivalo/ui public api', () => {
	it('renders disabled button semantics from the package root', () => {
		const { container } = render(Button, {
			disabled: true,
			children: snippet
		});

		const button = container.querySelector('button');
		expect(button).not.toBeNull();
		expect(button?.hasAttribute('disabled')).toBe(true);
		expect((button as HTMLButtonElement | null)?.disabled).toBe(true);
	});

	it('renders badge variants from the package root', () => {
		const { container } = render(Badge, {
			status: 'coming-soon',
			size: 'sm',
			children: snippet
		});

		const badge = container.querySelector('.badge-coming-soon.badge-sm');
		expect(badge).not.toBeNull();
		expect(container.textContent).toContain('Rendered child');
	});

	it('keeps card link rendering limited to safe href values', () => {
		const safeRender = render(Card, {
			variant: 'link',
			href: '/services',
			header: 'Header',
			children: snippet
		});
		const allowedAbsoluteRender = render(Card, {
			variant: 'link',
			href: 'https://kaivalo.com/services',
			allowExternal: true,
			allowedExternalHosts: ['kaivalo.com'],
			children: snippet
		});
		const unsafeRender = render(Card, {
			variant: 'link',
			href: 'javascript:alert(1)',
			children: snippet
		});

		expect(safeRender.container.querySelector('a')?.getAttribute('href')).toBe(
			'/services'
		);
		expect(
			allowedAbsoluteRender.container.querySelector('a')?.getAttribute('href')
		).toBe('https://kaivalo.com/services');
		expect(unsafeRender.container.querySelector('a')).toBeNull();
	});

	it('renders container sizing from the package root', () => {
		const { container } = render(Container, {
			size: 'xl',
			class: 'custom-wrapper',
			children: snippet
		});

		const root = container.firstElementChild;
		expect(root).not.toBeNull();
		expect(root?.className).toContain('custom-wrapper');
		expect(root?.className).toContain('max-w-screen-xl');
	});
});
