import type { Component, Snippet } from 'svelte';

interface ButtonProps {
	type?: 'button' | 'submit' | 'reset';
	variant?: 'primary' | 'secondary' | 'ghost';
	size?: 'sm' | 'md' | 'lg';
	disabled?: boolean;
	onclick?: (event: MouseEvent) => void;
	class?: string;
	children?: Snippet;
}

interface BadgeProps {
	status?: 'live' | 'beta' | 'coming-soon' | 'default';
	size?: 'sm' | 'md';
	class?: string;
	children?: Snippet;
}

interface CardProps {
	variant?: 'default' | 'link';
	href?: string;
	header?: string;
	hover?: boolean;
	allowExternal?: boolean;
	allowedExternalHosts?: string[];
	class?: string;
	children?: Snippet;
}

interface ContainerProps {
	size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
	class?: string;
	children?: Snippet;
}

export const Button: Component<ButtonProps>;
export const Card: Component<CardProps>;
export const Badge: Component<BadgeProps>;
export const Container: Component<ContainerProps>;
