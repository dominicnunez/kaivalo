<script>
  /**
   * Button component with variant, size, and disabled state support
   * @typedef {'primary' | 'secondary' | 'ghost'} Variant
   * @typedef {'sm' | 'md' | 'lg'} Size
   */

  /** @type {{ type?: 'button' | 'submit' | 'reset', variant?: Variant, size?: Size, disabled?: boolean, onclick?: (e: MouseEvent) => void, class?: string, children?: import('svelte').Snippet }} */
  let {
    type = 'button',
    variant = 'primary',
    size = 'md',
    disabled = false,
    onclick,
    class: className = '',
    children
  } = $props();
</script>

<button
  {type}
  class="btn btn-{variant} btn-{size} {disabled ? 'btn-disabled' : ''} {className}"
  {disabled}
  onclick={onclick}
>
  {@render children?.()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 500;
    border-radius: 0.5rem;
    transition: all 0.2s;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .btn-primary {
    background: var(--accent);
    color: var(--bg-primary);
  }
  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
  }
  .btn-primary:disabled {
    opacity: 0.4;
  }

  .btn-secondary {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border-color: var(--border);
  }
  .btn-secondary:hover:not(:disabled) {
    border-color: var(--border-hover);
  }
  .btn-secondary:disabled {
    opacity: 0.4;
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-secondary);
  }
  .btn-ghost:hover:not(:disabled) {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
  .btn-ghost:disabled {
    opacity: 0.4;
  }

  .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.875rem; }
  .btn-md { padding: 0.5rem 1rem; font-size: 1rem; }
  .btn-lg { padding: 0.75rem 1.5rem; font-size: 1.125rem; }

  .btn-disabled { cursor: not-allowed; }
</style>
