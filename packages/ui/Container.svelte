<script lang="ts">
	import type { ContainerProps } from './props.ts';

	let {
		size = 'lg',
		class: className = '',
		children,
		...restProps
	}: ContainerProps = $props();

	const baseClasses = 'w-full mx-auto px-4 sm:px-6 lg:px-8';

	const sizeClasses = {
		sm: 'max-w-screen-sm',
		md: 'max-w-screen-md',
		lg: 'max-w-screen-lg',
		xl: 'max-w-screen-xl',
		full: 'max-w-full'
	};
	let resolvedSize = $derived(sizeClasses[size] ? size : 'lg');

	let computedClasses = $derived(
		`${baseClasses} ${sizeClasses[resolvedSize]} ${className}`.trim()
	);
</script>

<div
	{...restProps}
	class={computedClasses}
	data-ui="container"
	data-size={resolvedSize}
>
	{@render children?.()}
</div>
