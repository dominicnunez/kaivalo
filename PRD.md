# PRD: WorkOS AuthKit Integration — kaivalo.com Hub

## Context
Add shared authentication across all kaivalo tools using WorkOS AuthKit.
Hub is SvelteKit + adapter-node, running on port 3100.

**UNBLOCKED** — Credentials configured in `.env`:
- WORKOS_CLIENT_ID ✅ (in .env)
- WORKOS_API_KEY ✅ (in .env)
- WORKOS_REDIRECT_URI = http://localhost:3100/auth/callback (dev), will change for prod
- WORKOS_COOKIE_PASSWORD ✅ (generated, in .env)

## Research (done)
- Official `@workos/authkit-sveltekit` package exists
- SvelteKit integration: hooks.server.ts handle + callback route + withAuth()
- Free tier: unlimited MAUs for AuthKit

## Tasks

### 1. Install WorkOS AuthKit
- [x] `npm install @workos-inc/authkit-sveltekit`
- [x] Create `.env` from `.env.example` with WorkOS vars (placeholder values for now)

### 2. Configure hooks
- [x] Create `src/hooks.server.ts` with WorkOS handleAuth()
- [x] Follow official SvelteKit guide: https://workos.com/docs/user-management/sveltekit

### 3. Add auth callback route
- [x] Create `src/routes/auth/callback/+server.ts` for OAuth callback

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
