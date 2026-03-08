import { describe, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from '@testing-library/svelte';
import { Badge, Button, Card, Container } from '@kaivalo/ui';

const snippet = createRawSnippet(() => ({
	render: () => '<span>Rendered child</span>'
}));

describe('ui components', () => {
	it('exposes disabled semantics for non-interactive button states', () => {
		const { container } = render(Button, {
			disabled: true,
			children: snippet
		});

		const button = container.querySelector('button');
		expect(button).not.toBeNull();
		expect(button?.hasAttribute('disabled')).toBe(true);
		expect((button as HTMLButtonElement)?.disabled).toBe(true);
		expect(container.textContent).toContain('Rendered child');
	});

	it('renders badge content with the requested status styling', () => {
		const { container } = render(Badge, {
			status: 'coming-soon',
			size: 'sm',
			children: snippet
		});

		const badge = container.querySelector('.badge-coming-soon.badge-sm');
		if (!badge) {
			throw new Error(
				'Expected badge wrapper to render with requested classes'
			);
		}
		expect(badge.className).toContain('badge-coming-soon');
		expect(badge.className).toContain('badge-sm');
		expect(container.textContent).toContain('Rendered child');
	});

	it('renders card link variant only for relative or explicitly-allowed absolute href values', () => {
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
		expect(unsafeRender.container.querySelector('div')).not.toBeNull();
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

	it('renders container with selected size class and custom class', () => {
		const { container } = render(Container, {
			size: 'xl',
			class: 'custom-wrapper',
			children: snippet
		});

		const root = container.firstElementChild;
		expect(root).not.toBeNull();
		expect(root?.className).toContain('custom-wrapper');
		expect(root?.className).toContain('max-w-screen-xl');
		expect(container.textContent).toContain('Rendered child');
	});
});
