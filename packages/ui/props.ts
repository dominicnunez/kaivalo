import type { Snippet } from 'svelte';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
	type?: 'button' | 'submit' | 'reset';
	variant?: ButtonVariant;
	size?: ButtonSize;
	disabled?: boolean;
	onclick?: (event: MouseEvent) => void;
	class?: string;
	children?: Snippet;
}

export type BadgeStatus = 'live' | 'beta' | 'coming-soon' | 'default';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
	status?: BadgeStatus;
	size?: BadgeSize;
	class?: string;
	children?: Snippet;
}

export type CardVariant = 'default' | 'link';

export interface CardProps {
	variant?: CardVariant;
	href?: string;
	header?: string;
	hover?: boolean;
	allowExternal?: boolean;
	allowedExternalHosts?: string[];
	class?: string;
	children?: Snippet;
}

export type ContainerSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ContainerProps {
	size?: ContainerSize;
	class?: string;
	children?: Snippet;
}
