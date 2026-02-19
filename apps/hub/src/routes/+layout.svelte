<script lang="ts">
  import '../app.css';
  import { Container } from '@kaivalo/ui';
  import { LogIn, LogOut } from 'lucide-svelte';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: any } = $props();
</script>

<div class="min-h-screen grain">
  <!-- Nav -->
  <nav class="relative z-20 py-4">
    <Container size="lg">
      <div class="flex items-center justify-between">
        <a href="/" class="font-display text-sm font-semibold tracking-tight"
          style="color: var(--text-primary);">
          kaivalo
        </a>

        <div class="flex items-center gap-3">
          {#if data.user}
            <div class="flex items-center gap-3">
              {#if data.user.profilePictureUrl}
                <img
                  src={data.user.profilePictureUrl}
                  alt={data.user.firstName ?? 'User'}
                  class="w-7 h-7 rounded-full object-cover"
                  style="border: 1px solid var(--border);"
                />
              {:else}
                <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                  style="background: var(--accent-dim); color: var(--accent); border: 1px solid var(--border);">
                  {(data.user.firstName?.[0] ?? data.user.email[0]).toUpperCase()}
                </div>
              {/if}
              <span class="text-xs hidden sm:inline" style="color: var(--text-secondary);">
                {data.user.firstName ?? data.user.email}
              </span>
            </div>
            <form method="POST" action="/auth/sign-out">
              <button type="submit"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 cursor-pointer"
                style="color: var(--text-muted); border: 1px solid var(--border); background: none;"
                onmouseenter={(e) => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                onmouseleave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
                <LogOut class="w-3.5 h-3.5" />
                Sign out
              </button>
            </form>
          {:else}
            <a href={data.signInUrl}
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200"
              style="background: var(--accent); color: var(--bg-primary);"
              onmouseenter={(e) => e.currentTarget.style.opacity = '0.9'}
              onmouseleave={(e) => e.currentTarget.style.opacity = '1'}>
              <LogIn class="w-3.5 h-3.5" />
              Sign in
            </a>
          {/if}
        </div>
      </div>
    </Container>
  </nav>

  <main>
    {@render children()}
  </main>
</div>
