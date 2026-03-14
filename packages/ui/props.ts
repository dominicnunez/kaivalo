import type { Snippet } from 'svelte';
import type {
	HTMLAnchorAttributes,
	HTMLButtonAttributes,
	SvelteHTMLElements
} from 'svelte/elements';

type ChildrenProp = {
	children?: Snippet;
};

type ClassProp = {
	class?: string;
};

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = ChildrenProp &
	ClassProp &
	Omit<HTMLButtonAttributes, 'children' | 'class'> & {
		variant?: ButtonVariant;
		size?: ButtonSize;
	};

export type BadgeStatus = 'live' | 'beta' | 'coming-soon' | 'default';
export type BadgeSize = 'sm' | 'md';

export type BadgeProps = ChildrenProp &
	ClassProp &
	Omit<SvelteHTMLElements['span'], 'children' | 'class'> & {
		status?: BadgeStatus;
		size?: BadgeSize;
	};

export type CardVariant = 'default' | 'link';

type CardBaseProps = ChildrenProp &
	ClassProp & {
		header?: string;
		hover?: boolean;
	};

export type CardLinkProps = CardBaseProps &
	Omit<HTMLAnchorAttributes, 'children' | 'class' | 'href'> & {
		variant: 'link';
		href?: string;
		allowExternal?: boolean;
		allowedExternalHosts?: string[];
	};

export type CardDefaultProps = CardBaseProps &
	Omit<SvelteHTMLElements['div'], 'children' | 'class'> & {
		variant?: 'default';
	};

export type CardProps = CardDefaultProps | CardLinkProps;

export type CardElementProps = CardBaseProps &
	Omit<
		HTMLAnchorAttributes & SvelteHTMLElements['div'],
		'children' | 'class' | 'href'
	> & {
		variant?: CardVariant;
		href?: string;
		allowExternal?: boolean;
		allowedExternalHosts?: string[];
	};

export type ContainerSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export type ContainerProps = ChildrenProp &
	ClassProp &
	Omit<SvelteHTMLElements['div'], 'children' | 'class'> & {
		size?: ContainerSize;
	};
