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
</script>

<span class="badge badge-{status} badge-{size} {className}">
  {@render children?.()}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    font-weight: 500;
    border-radius: 9999px;
  }

  .badge-live {
    background: rgba(34, 197, 94, 0.1);
    color: var(--accent, #22c55e);
  }
  .badge-beta {
    background: rgba(245, 158, 11, 0.1);
    color: #fbbf24;
  }
  .badge-coming-soon {
    background: var(--bg-tertiary, #16161f);
    color: var(--text-muted, #7e7e92);
  }
  .badge-default {
    background: var(--bg-tertiary, #16161f);
    color: var(--text-secondary, #8b8b9e);
  }

  .badge-sm { padding: 0.125rem 0.5rem; font-size: 0.75rem; }
  .badge-md { padding: 0.25rem 0.625rem; font-size: 0.875rem; }
</style>
