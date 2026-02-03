<script>
  /**
   * Button component with variant, size, and disabled state support
   * @typedef {'primary' | 'secondary' | 'ghost'} Variant
   * @typedef {'sm' | 'md' | 'lg'} Size
   */

  /** @type {{ variant?: Variant, size?: Size, disabled?: boolean, onclick?: (e: MouseEvent) => void, class?: string, children?: import('svelte').Snippet }} */
  let {
    variant = 'primary',
    size = 'md',
    disabled = false,
    onclick,
    class: className = '',
    children
  } = $props();

  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';

  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 disabled:bg-blue-300',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500 disabled:bg-gray-100 disabled:text-gray-400',
    ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500 disabled:text-gray-300'
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };

  let computedClasses = $derived(
    `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${disabled ? 'cursor-not-allowed' : ''} ${className}`.trim()
  );
</script>

<button
  class={computedClasses}
  {disabled}
  onclick={onclick}
>
  {@render children?.()}
</button>
