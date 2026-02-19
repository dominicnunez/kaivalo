# kaivalo hub — CLAUDE.md

## What This Is
Landing page + shared auth layer for kaivalo.com. Part of a monorepo (`/home/kai/pets/kaivalo`).

## Stack
- SvelteKit (Svelte 5 runes)
- Tailwind CSS v4
- `@workos/authkit-sveltekit` for auth
- Node adapter for PM2 deployment

## Structure
```
apps/hub/
├── src/
│   ├── routes/          # Pages
│   │   ├── +layout.svelte
│   │   ├── +page.svelte  # Landing page
│   │   └── +page.ts
│   └── lib/
├── package.json
└── svelte.config.js
```

## Workspace
This is an npm workspace. Shared packages in `packages/`:
- `@kaivalo/ui` — shared UI components

## Rules
- Svelte 5 runes (`$state`, `$derived`, `$effect`) — no legacy stores
- Tailwind v4 (CSS-based config, not tailwind.config.js)
- Match existing code patterns in the hub app
- Don't modify packages outside `apps/hub/` without explicit need
