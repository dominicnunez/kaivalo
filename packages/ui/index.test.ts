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
			id: 'cta-button',
			'aria-label': 'Launch service',
			'data-testid': 'launch-button',
			name: 'launch',
			formaction: '/services',
			children: snippet
		});

		const button = container.querySelector('button');
		expect(button).not.toBeNull();
		expect(button?.hasAttribute('disabled')).toBe(true);
		expect((button as HTMLButtonElement | null)?.disabled).toBe(true);
		expect(button?.getAttribute('id')).toBe('cta-button');
		expect(button?.getAttribute('aria-label')).toBe('Launch service');
		expect(button?.getAttribute('data-testid')).toBe('launch-button');
		expect(button?.getAttribute('name')).toBe('launch');
		expect(button?.getAttribute('formaction')).toBe('/services');
	});

	it('renders badge variants from the package root', () => {
		const { container } = render(Badge, {
			status: 'coming-soon',
			size: 'sm',
			id: 'status-badge',
			'aria-live': 'polite',
			'data-testid': 'badge',
			children: snippet
		});

		const badge = container.querySelector('[data-ui="badge"]');
		expect(badge).not.toBeNull();
		expect(badge?.getAttribute('data-status')).toBe('coming-soon');
		expect(badge?.getAttribute('data-size')).toBe('sm');
		expect(badge?.getAttribute('id')).toBe('status-badge');
		expect(badge?.getAttribute('aria-live')).toBe('polite');
		expect(badge?.getAttribute('data-testid')).toBe('badge');
		expect(container.textContent).toContain('Rendered child');
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
		const disallowedAbsoluteLink =
			disallowedAbsoluteRender.container.querySelector('a');
		const allowedAbsoluteLink =
			allowedAbsoluteRender.container.querySelector('a');
		const externalBlankLink = externalBlankRender.container.querySelector('a');
		const externalBlankWithoutRelLink =
			externalBlankWithoutRelRender.container.querySelector('a');
		const unsafeLink = unsafeRender.container.querySelector('a');
		const protocolRelativeLink =
			protocolRelativeRender.container.querySelector('a');
		const dataUrlLink = dataUrlRender.container.querySelector('a');
		const mixedCaseJavascriptLink =
			mixedCaseJavascriptRender.container.querySelector('a');
		const insecureAbsoluteLink =
			insecureAbsoluteRender.container.querySelector('a');
		const mixedCaseInsecureAbsoluteLink =
			mixedCaseInsecureAbsoluteRender.container.querySelector('a');
		const credentialedAbsoluteLink =
			credentialedAbsoluteRender.container.querySelector('a');
		const nonDefaultPortLink =
			nonDefaultPortRender.container.querySelector('a');
		const normalizedAllowlistLink =
			normalizedAllowlistRender.container.querySelector('a');

		expect(safeLink).not.toBeNull();
		expect(safeLink?.getAttribute('href')).toBe('/services');
		expect(safeLink?.getAttribute('id')).toBe('services-card');
		expect(safeLink?.getAttribute('aria-describedby')).toBe('services-copy');
		expect(safeLink?.getAttribute('data-testid')).toBe('services-card');
		expect(safeLink?.getAttribute('target')).toBe('_blank');
		expect(safeLink?.getAttribute('rel')).toBe('noreferrer');
		expect(safeLink?.getAttribute('data-card-state')).toBe('link');
		expect(allowedAbsoluteLink?.getAttribute('href')).toBe(
			'https://kaivalo.com/services'
		);
		expect(externalBlankLink?.getAttribute('target')).toBe('_blank');
		expect(externalBlankLink?.getAttribute('rel')).toBe('noreferrer noopener');
		expect(externalBlankWithoutRelLink?.getAttribute('rel')).toBe(
			'noopener noreferrer'
		);
		expect(safeRender.container.textContent).toContain('Header');
		expect(normalizedAllowlistLink?.getAttribute('href')).toBe(
			'https://kaivalo.com/services'
		);

		for (const disabledLink of [
			disallowedAbsoluteLink,
			unsafeLink,
			protocolRelativeLink,
			dataUrlLink,
			mixedCaseJavascriptLink,
			insecureAbsoluteLink,
			mixedCaseInsecureAbsoluteLink,
			credentialedAbsoluteLink,
			nonDefaultPortLink
		]) {
			expect(disabledLink?.getAttribute('data-card-state')).toBe('disabled');
			expect(disabledLink?.hasAttribute('href')).toBe(false);
		}
	});

	it('renders invalid link cards as explicitly disabled anchors', () => {
		const { container } = render(Card, {
			props: {
				variant: 'link',
				href: 'javascript:alert(1)',
				id: 'unsafe-card',
				'data-testid': 'unsafe-card',
				target: '_blank',
				rel: 'noreferrer',
				children: snippet
			}
		});

		const card = container.querySelector('[data-ui="card"]');
		expect(card?.tagName).toBe('A');
		expect(card?.getAttribute('id')).toBe('unsafe-card');
		expect(card?.getAttribute('data-testid')).toBe('unsafe-card');
		expect(card?.getAttribute('aria-disabled')).toBe('true');
		expect(card?.getAttribute('data-card-state')).toBe('disabled');
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

			const disabledCard =
				testRender.container.querySelector('[data-ui="card"]');
			expect(disabledCard?.tagName).toBe('A');
			expect(disabledCard?.getAttribute('data-card-state')).toBe('disabled');
			expect(disabledCard?.hasAttribute('href')).toBe(false);
		}
	});

	it('renders container sizing from the package root', () => {
		const { container } = render(Container, {
			size: 'xl',
			class: 'custom-wrapper',
			id: 'page-container',
			'aria-labelledby': 'page-title',
			'data-testid': 'container',
			children: snippet
		});

		const root = container.firstElementChild;
		expect(root).not.toBeNull();
		expect(root?.className).toContain('custom-wrapper');
		expect(root?.getAttribute('data-size')).toBe('xl');
		expect(root?.getAttribute('id')).toBe('page-container');
		expect(root?.getAttribute('aria-labelledby')).toBe('page-title');
		expect(root?.getAttribute('data-testid')).toBe('container');
	});
});
