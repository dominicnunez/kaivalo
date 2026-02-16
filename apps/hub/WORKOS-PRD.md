# PRD: WorkOS AuthKit Integration — kaivalo.com Hub

## Context
Add shared authentication across all kaivalo tools using WorkOS AuthKit.
Hub is SvelteKit + adapter-node, running on port 3100.

**Blocked until:** Aural creates a WorkOS account and provides:
- WORKOS_CLIENT_ID
- WORKOS_API_KEY  
- WORKOS_REDIRECT_URI (https://kaivalo.com/auth/callback)
- WORKOS_COOKIE_PASSWORD (32+ char random string)

## Research (done)
- Official `@workos/authkit-sveltekit` package exists
- SvelteKit integration: hooks.server.ts handle + callback route + withAuth()
- Free tier: unlimited MAUs for AuthKit

## Tasks

### 1. Install WorkOS AuthKit
- [ ] `npm install @workos-inc/authkit-sveltekit`
- [ ] Create `.env` from `.env.example` with WorkOS vars (placeholder values for now)

### 2. Configure hooks
- [ ] Create `src/hooks.server.ts` with WorkOS handleAuth()
- [ ] Follow official SvelteKit guide: https://workos.com/docs/user-management/sveltekit

### 3. Add auth callback route
- [ ] Create `src/routes/auth/callback/+server.ts` for OAuth callback

### 4. Add sign-in/sign-out to layout
- [ ] Update `src/routes/+layout.server.ts` to pass user session data
- [ ] Add sign-in button to header/nav (currently no nav — add minimal one)
- [ ] Add sign-out functionality
- [ ] Show user name/avatar when authenticated

### 5. Protect future routes
- [ ] Create `src/lib/auth.ts` helper for route protection (withAuth wrapper)
- [ ] Document pattern for protecting new routes

### 6. Verify
- [ ] `npm run build` passes
- [ ] Auth flow works end-to-end (sign in → callback → session → sign out)

## Constraints
- SvelteKit + Svelte 5 runes
- Don't break existing landing page (unauthenticated users should still see it)
- Landing page stays public — auth only needed for tool access
- Keep dark theme consistent with existing design
