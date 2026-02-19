<script>
  /**
   * Container component - max-width wrapper with responsive padding
   * @typedef {'sm' | 'md' | 'lg' | 'xl' | 'full'} Size
   */

  /** @type {{ size?: Size, class?: string, children?: import('svelte').Snippet }} */
  let {
    size = 'lg',
    class: className = '',
    children
  } = $props();

  const baseClasses = 'w-full mx-auto px-4 sm:px-6 lg:px-8';

  const sizeClasses = {
    sm: 'max-w-screen-sm',
    md: 'max-w-screen-md',
    lg: 'max-w-screen-lg',
    xl: 'max-w-screen-xl',
    full: 'max-w-full'
  };

  let computedClasses = $derived(
    `${baseClasses} ${sizeClasses[size] ?? sizeClasses.lg} ${className}`.trim()
  );
</script>

<div class={computedClasses}>
  {@render children?.()}
</div>
