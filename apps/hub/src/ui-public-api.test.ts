import { createRawSnippet } from 'svelte';
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { Badge, Button, Card, Container } from '@kaivalo/ui';

const snippet = createRawSnippet(() => ({
	render: () => '<span>Public API child</span>'
}));

describe('ui public api', () => {
	it('renders package exports for consumers', () => {
		const buttonRender = render(Button, {
			disabled: true,
			children: snippet
		});
		const badgeRender = render(Badge, {
			status: 'coming-soon',
			children: snippet
		});
		const cardRender = render(Card, {
			variant: 'link',
			href: '/services',
			header: 'Services',
			children: snippet
		});
		const containerRender = render(Container, {
			size: 'lg',
			children: snippet
		});

		expect(buttonRender.container.querySelector('button')?.disabled).toBe(true);
		expect(
			badgeRender.container.querySelector('.badge-coming-soon')
		).not.toBeNull();
		expect(cardRender.container.querySelector('a')?.getAttribute('href')).toBe(
			'/services'
		);
		expect(containerRender.container.firstElementChild?.className).toContain(
			'max-w-screen-lg'
		);
	});
});
