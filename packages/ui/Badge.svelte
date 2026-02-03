<script>
  /**
   * Badge component for status indicators (Live/Beta/Coming Soon)
   * @typedef {'live' | 'beta' | 'coming-soon' | 'default'} Status
   * @typedef {'sm' | 'md'} Size
   */

  /** @type {{ status?: Status, size?: Size, class?: string, children?: import('svelte').Snippet }} */
  let {
    status = 'default',
    size = 'md',
    class: className = '',
    children
  } = $props();

  const baseClasses = 'inline-flex items-center font-medium rounded-full';

  const statusClasses = {
    'live': 'bg-emerald-100 text-emerald-800',
    'beta': 'bg-amber-100 text-amber-800',
    'coming-soon': 'bg-gray-100 text-gray-600',
    'default': 'bg-blue-100 text-blue-800'
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm'
  };

  let computedClasses = $derived(
    `${baseClasses} ${statusClasses[status]} ${sizeClasses[size]} ${className}`.trim()
  );
</script>

<span class={computedClasses}>
  {@render children?.()}
</span>
