<script>
  /**
   * Card component with optional header, hover effect, and link variant
   * @typedef {'default' | 'link'} Variant
   */

  /** @type {{ variant?: Variant, href?: string, header?: string, hover?: boolean, class?: string, children?: import('svelte').Snippet }} */
  let {
    variant = 'default',
    href = '',
    header = '',
    hover = true,
    class: className = '',
    children
  } = $props();

  const baseClasses = 'bg-white rounded-xl border border-gray-200 overflow-hidden';

  const hoverClasses = 'transition-shadow hover:shadow-lg';

  const linkClasses = 'cursor-pointer';

  let computedClasses = $derived(
    `${baseClasses} ${hover ? hoverClasses : ''} ${variant === 'link' ? linkClasses : ''} ${className}`.trim()
  );

  let isLink = $derived(variant === 'link' && href);
</script>

{#if isLink}
  <a {href} class={computedClasses}>
    {#if header}
      <div class="px-6 py-4 border-b border-gray-200 font-semibold text-gray-900">
        {header}
      </div>
    {/if}
    <div class="p-6">
      {@render children?.()}
    </div>
  </a>
{:else}
  <div class={computedClasses}>
    {#if header}
      <div class="px-6 py-4 border-b border-gray-200 font-semibold text-gray-900">
        {header}
      </div>
    {/if}
    <div class="p-6">
      {@render children?.()}
    </div>
  </div>
{/if}
