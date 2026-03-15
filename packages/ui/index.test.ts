import { describe, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from '@testing-library/svelte';
import { Badge, Button, Card, Container } from './index.ts';

const snippet = createRawSnippet(() => ({
	render: () => '<span>Rendered child</span>'
}));

describe('@kaivalo/ui public api', () => {
	it('renders disabled button semantics from the package root', () => {
		const { getByRole } = render(Button, {
			disabled: true,
			'aria-label': 'Launch service',
			name: 'launch',
			formaction: '/services',
			children: snippet
		});

		const button = getByRole('button', { name: 'Launch service' });
		expect((button as HTMLButtonElement).disabled).toBe(true);
		expect(button.textContent).toContain('Rendered child');
		expect(button.getAttribute('name')).toBe('launch');
		expect(button.getAttribute('formaction')).toBe('/services');
	});

	it('renders badge variants from the package root', () => {
		const { getByText } = render(Badge, {
			status: 'coming-soon',
			size: 'sm',
			'aria-live': 'polite',
			children: snippet
		});

		const badge = getByText('Rendered child').parentElement;
		expect(badge).not.toBeNull();
		expect(badge?.tagName).toBe('SPAN');
		expect(badge?.getAttribute('aria-live')).toBe('polite');
	});

	it('forwards link-card attributes when the href is safe', () => {
		const safeRender = render(Card, {
			props: {
				variant: 'link',
				href: '/services',
				header: 'Header',
				id: 'services-card',
				'aria-describedby': 'services-copy',
				'data-testid': 'services-card',
				target: '_blank',
				rel: 'noreferrer',
				children: snippet
			}
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
		const externalBlankRender = render(Card, {
			props: {
				variant: 'link',
				href: 'https://kaivalo.com/services',
				allowExternal: true,
				allowedExternalHosts: ['kaivalo.com'],
				target: '_blank',
				rel: 'noreferrer',
				children: snippet
			}
		});
		const externalBlankWithoutRelRender = render(Card, {
			props: {
				variant: 'link',
				href: 'https://kaivalo.com/services',
				allowExternal: true,
				allowedExternalHosts: ['kaivalo.com'],
				target: '_blank',
				children: snippet
			}
		});
		const unsafeRender = render(Card, {
			variant: 'link',
			href: 'javascript:alert(1)',
			children: snippet
		});
		const protocolRelativeRender = render(Card, {
			variant: 'link',
			href: '//evil.example/path',
			children: snippet
		});
		const dataUrlRender = render(Card, {
			variant: 'link',
			href: 'data:text/html,<script>alert(1)</script>',
			children: snippet
		});
		const mixedCaseJavascriptRender = render(Card, {
			variant: 'link',
			href: 'JaVaScRiPt:alert(1)',
			children: snippet
		});
		const insecureAbsoluteRender = render(Card, {
			variant: 'link',
			href: 'http://kaivalo.com/services',
			allowExternal: true,
			allowedExternalHosts: ['kaivalo.com'],
			children: snippet
		});
		const mixedCaseInsecureAbsoluteRender = render(Card, {
			variant: 'link',
			href: 'HtTp://kaivalo.com/services',
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
		const allowedAbsoluteLink =
			allowedAbsoluteRender.container.querySelector('a');
		const externalBlankLink = externalBlankRender.container.querySelector('a');
		const externalBlankWithoutRelLink =
			externalBlankWithoutRelRender.container.querySelector('a');
		const normalizedAllowlistLink =
			normalizedAllowlistRender.container.querySelector('a');

		expect(safeLink?.getAttribute('href')).toBe('/services');
		expect(safeLink?.textContent).toContain('Header');
		expect(safeLink?.getAttribute('aria-describedby')).toBe('services-copy');
		expect(safeLink?.getAttribute('target')).toBe('_blank');
		expect(safeLink?.getAttribute('rel')).toBe('noreferrer');
		expect(allowedAbsoluteLink?.getAttribute('href')).toBe(
			'https://kaivalo.com/services'
		);
		expect(externalBlankLink?.getAttribute('target')).toBe('_blank');
		expect(externalBlankLink?.getAttribute('rel')).toBe('noreferrer noopener');
		expect(externalBlankWithoutRelLink?.getAttribute('rel')).toBe(
			'noopener noreferrer'
		);
		expect(normalizedAllowlistLink?.getAttribute('href')).toBe(
			'https://kaivalo.com/services'
		);

		for (const disabledRender of [
			disallowedAbsoluteRender,
			unsafeRender,
			protocolRelativeRender,
			dataUrlRender,
			mixedCaseJavascriptRender,
			insecureAbsoluteRender,
			mixedCaseInsecureAbsoluteRender,
			credentialedAbsoluteRender,
			nonDefaultPortRender
		]) {
			expect(disabledRender.container.querySelector('a[href]')).toBeNull();

			const disabledCard = disabledRender.container.querySelector('a');
			expect(disabledCard?.getAttribute('aria-disabled')).toBe('true');
			expect(disabledCard?.hasAttribute('href')).toBe(false);
		}
	});

	it('renders invalid link cards as explicitly disabled anchors', () => {
		const { getByText } = render(Card, {
			props: {
				variant: 'link',
				href: 'javascript:alert(1)',
				target: '_blank',
				rel: 'noreferrer',
				children: snippet
			}
		});

		const card = getByText('Rendered child').closest('a');
		expect(card?.tagName).toBe('A');
		expect(card?.getAttribute('aria-disabled')).toBe('true');
		expect(card?.getAttribute('target')).toBe('_blank');
		expect(card?.getAttribute('rel')).toBe('noreferrer');
		expect(card?.hasAttribute('href')).toBe(false);
		expect(card?.getAttribute('tabindex')).toBe('-1');
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

	it('does not render live hrefs for unsafe relative link variants', () => {
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

			const disabledCard = testRender.container.querySelector('a');
			expect(disabledCard?.tagName).toBe('A');
			expect(testRender.container.querySelector('a[href]')).toBeNull();
			expect(disabledCard?.getAttribute('aria-disabled')).toBe('true');
			expect(disabledCard?.hasAttribute('href')).toBe(false);
		}
	});

	it('renders container sizing from the package root', () => {
		const { getByText } = render(Container, {
			size: 'xl',
			class: 'custom-wrapper',
			id: 'page-container',
			'aria-labelledby': 'page-title',
			children: snippet
		});

		const root = getByText('Rendered child').parentElement;
		expect(root).not.toBeNull();
		expect(root?.className).toContain('custom-wrapper');
		expect(root?.getAttribute('id')).toBe('page-container');
		expect(root?.getAttribute('aria-labelledby')).toBe('page-title');
	});
});
