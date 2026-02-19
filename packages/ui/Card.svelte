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

  let safeHref = $derived(href && /^(\/|#|https?:\/\/)/.test(href) ? href : '');
  let isLink = $derived(variant === 'link' && safeHref);
</script>

{#if isLink}
  <a href={safeHref} class="card {hover ? 'card-hover' : ''} {className}">
    {#if header}
      <div class="card-header">{header}</div>
    {/if}
    <div class="card-body">
      {@render children?.()}
    </div>
  </a>
{:else}
  <div class="card {hover ? 'card-hover' : ''} {className}">
    {#if header}
      <div class="card-header">{header}</div>
    {/if}
    <div class="card-body">
      {@render children?.()}
    </div>
  </div>
{/if}

<style>
  .card {
    background: var(--bg-card);
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    overflow: hidden;
    display: block;
    text-decoration: none;
    color: inherit;
  }

  .card-hover {
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
  }
  .card-hover:hover {
    border-color: var(--border-hover);
    box-shadow: 0 0 40px var(--accent-glow), 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .card-header {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
    color: var(--text-primary);
  }

  .card-body {
    padding: 1.5rem;
  }
</style>
