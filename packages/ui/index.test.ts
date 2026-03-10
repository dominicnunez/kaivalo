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

		const badge = container.querySelector('[data-ui="badge"]');
		expect(badge).not.toBeNull();
		expect(badge?.getAttribute('data-status')).toBe('coming-soon');
		expect(badge?.getAttribute('data-size')).toBe('sm');
		expect(container.textContent).toContain('Rendered child');
	});

	it('keeps card link rendering limited to safe href values', () => {
		const safeRender = render(Card, {
			variant: 'link',
			href: '/services',
			header: 'Header',
			children: snippet
		});
		const disallowedAbsoluteRender = render(Card, {
			variant: 'link',
			href: 'https://kaivalo.com/services',
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
		const insecureAbsoluteRender = render(Card, {
			variant: 'link',
			href: 'http://kaivalo.com/services',
			allowExternal: true,
			allowedExternalHosts: ['kaivalo.com'],
			children: snippet
		});
		const credentialedAbsoluteRender = render(Card, {
			variant: 'link',
			href: 'https://user:pass@kaivalo.com/services',
			allowExternal: true,
			allowedExternalHosts: ['kaivalo.com'],
			children: snippet
		});
		const nonDefaultPortRender = render(Card, {
			variant: 'link',
			href: 'https://kaivalo.com:8443/services',
			allowExternal: true,
			allowedExternalHosts: ['kaivalo.com'],
			children: snippet
		});
		const normalizedAllowlistRender = render(Card, {
			variant: 'link',
			href: 'https://Kaivalo.com:443/services',
			allowExternal: true,
			allowedExternalHosts: [' KAIVALO.COM '],
			children: snippet
		});

		const safeLink = safeRender.container.querySelector('a');
		const disallowedAbsoluteLink =
			disallowedAbsoluteRender.container.querySelector('a');
		const allowedAbsoluteLink =
			allowedAbsoluteRender.container.querySelector('a');
		const unsafeLink = unsafeRender.container.querySelector('a');
		const insecureAbsoluteLink =
			insecureAbsoluteRender.container.querySelector('a');
		const credentialedAbsoluteLink =
			credentialedAbsoluteRender.container.querySelector('a');
		const nonDefaultPortLink =
			nonDefaultPortRender.container.querySelector('a');
		const normalizedAllowlistLink =
			normalizedAllowlistRender.container.querySelector('a');

		expect(safeLink).not.toBeNull();
		expect(safeLink?.getAttribute('href')).toBe('/services');
		expect(disallowedAbsoluteLink).toBeNull();
		expect(allowedAbsoluteLink?.getAttribute('href')).toBe(
			'https://kaivalo.com/services'
		);
		expect(safeRender.container.textContent).toContain('Header');
		expect(unsafeLink).toBeNull();
		expect(insecureAbsoluteLink).toBeNull();
		expect(credentialedAbsoluteLink).toBeNull();
		expect(nonDefaultPortLink).toBeNull();
		expect(normalizedAllowlistLink?.getAttribute('href')).toBe(
			'https://kaivalo.com/services'
		);
		expect(
			unsafeRender.container.querySelector('[data-ui="card"]')
		).not.toBeNull();
	});

	it('preserves fragment-only card links from the package root', () => {
		const { container } = render(Card, {
			variant: 'link',
			href: '#',
			children: snippet
		});

		const link = container.querySelector('a');
		expect(link).not.toBeNull();
		expect(link?.getAttribute('href')).toBe('#');
	});

	it('does not render card link anchors for unsafe relative href variants', () => {
		const unsafeRelativeHrefs = [
			'/\n//evil.example/path',
			'/\t//evil.example/path',
			'/\\//evil.example/path',
			' /services',
			'/services ',
			'#/fragment ',
			'/%0A//evil.example/path',
			'/%09//evil.example/path',
			'/%2F%2Fevil.example/path',
			'/%5C//evil.example/path'
		];

		for (const href of unsafeRelativeHrefs) {
			const testRender = render(Card, {
				variant: 'link',
				href,
				children: snippet
			});

			expect(testRender.container.querySelector('a')).toBeNull();
		}
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
		expect(root?.getAttribute('data-size')).toBe('xl');
	});
});
