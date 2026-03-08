import type { Component } from 'svelte';
import type {
	BadgeProps,
	ButtonProps,
	CardProps,
	ContainerProps
} from './props.ts';

export const Button: Component<ButtonProps>;
export const Card: Component<CardProps>;
export const Badge: Component<BadgeProps>;
export const Container: Component<ContainerProps>;

export type {
	BadgeProps,
	ButtonProps,
	CardProps,
	ContainerProps
} from './props.ts';
