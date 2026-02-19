# Audit Exceptions

> Items validated as false positives or accepted as won't-fix.
> Managed by willie audit loop. Do not edit format manually.

## False Positives

### Nginx mechai subdomain lacks auth rate limiting
- **File**: infrastructure/nginx/kaivalo.com:91
- **Date**: 2026-02-18
- **Reason**: mechai.kaivalo.com has no auth routes. The finding flags a hypothetical future scenario and acknowledges "no action needed now" in its own suggested fix. There is no misconfiguration — rate limiting can be added if/when auth routes are introduced.

### Build output committed to repository
- **File**: apps/hub/build/
- **Date**: 2026-02-18
- **Reason**: Build output is NOT committed. `git ls-files` returns nothing for `apps/hub/build/` and `.gitignore` excludes `build/`. The audit acknowledged this but kept the finding anyway, pivoting to a secondary concern that `hub-auth-layout.test.js` asserts the build directory exists — which is normal build test behavior, not a code quality issue.

### Sign-out form has no CSRF token
- **File**: apps/hub/src/routes/+layout.svelte:40-46
- **Date**: 2026-02-19
- **Reason**: The audit claims "SvelteKit does not enforce CSRF on POST by default when Content-Type is application/x-www-form-urlencoded." This is factually wrong. SvelteKit's `csrf.checkOrigin` defaults to `true` and checks the `Origin` header on all form submissions regardless of Content-Type. The project's `svelte.config.js` does not override this default. The form is already protected by SvelteKit's built-in CSRF check.

### Security headers applied before auth — auth errors bypass CSP
- **File**: apps/hub/src/hooks.server.ts:39
- **Date**: 2026-02-19
- **Reason**: The audit claims `authKitHandle()` constructs new Response objects for redirects that bypass the `securityHeaders` handler. This is factually wrong. The `authKitHandle()` implementation (line 10522 of `@workos/authkit-sveltekit/dist/index.js`) calls `await resolve(event)` — it does not construct its own Response. In `sequence(securityHeaders, authKitHandle())`, securityHeaders wraps resolve, so its post-processing runs on ALL responses including those flowing through authKitHandle. Auth redirects use SvelteKit's `redirect()` throw, which is handled by SvelteKit's resolve chain, not by authKitHandle.

### sequence() hook ordering means security headers potentially overwritten
- **File**: apps/hub/src/hooks.server.ts:39
- **Date**: 2026-02-19
- **Reason**: Same root issue as above. The audit claims authKitHandle could overwrite security headers set by securityHeaders. In `sequence(securityHeaders, authKitHandle())`, securityHeaders runs *after* authKitHandle in the response path (it wraps resolve). securityHeaders always has the final say on headers. Additionally, authKitHandle only conditionally sets cookie headers for session refresh — it does not set CSP or any security headers.

## Intentional Design Decisions

### Page metadata uses hardcoded production URL for OpenGraph
- **File**: apps/hub/src/routes/+page.ts:8-9
- **Date**: 2026-02-19
- **Reason**: OG `url` and `image` must always reference the canonical production URL (`https://kaivalo.com`) regardless of which environment rendered the page. Using `event.url.origin` would produce `http://localhost:5173` in dev, which is wrong for OG previews and SEO canonical URLs. The production domain is the correct value to hardcode here.

## Won't Fix

### CSP img-src allows `https:` broadly
- **File**: apps/hub/src/hooks.server.ts
- **Date**: 2026-02-18
- **Severity**: Low
- **Reason**: WorkOS profile pictures come from whichever social provider the user authenticates with (Google, GitHub, Microsoft, etc.). The CDN domains are not enumerable upfront and change as WorkOS adds providers. Restricting to a static allowlist would break avatars for users of unlisted providers. The risk (pixel tracking via image requests) is low given that `connect-src` and `default-src` are already locked to `'self'`, so no data can be exfiltrated via fetch/XHR. Revisit if WorkOS documents a stable set of avatar CDN domains.

### CSP style-src allows `'unsafe-inline'`
- **File**: apps/hub/src/hooks.server.ts
- **Date**: 2026-02-18
- **Severity**: Medium
- **Reason**: 37 inline `style=` attributes across Svelte templates use CSS custom properties (`color: var(--text-muted)`, etc.) for theming. Migrating all to Tailwind arbitrary properties would be a disproportionate refactor. The inline JS event handlers that originally motivated this finding have been replaced with CSS `:hover` classes. Style injection (`style-src`) is far less dangerous than script injection — `script-src` remains locked to `'self'`. Revisit when migrating the design system to Tailwind-native theming.

### Nginx serving HTTP only — no SSL active
- **File**: infrastructure/nginx/kaivalo.com
- **Date**: 2026-02-18
- **Severity**: High
- **Reason**: SSL requires domain purchase and DNS propagation before certbot can issue certificates. The config includes commented-out SSL blocks and an HTTP-to-HTTPS redirect ready to activate. This is a known pre-launch state, not a misconfiguration. Rate limiting and server_tokens have been hardened in the meantime. Resolve before any real users hit the site.

### Auth callback redirect URI uses HTTP in .env
- **File**: apps/hub/.env (gitignored)
- **Date**: 2026-02-18
- **Severity**: High
- **Reason**: The `.env` file is gitignored and not deployed — it's the local development config. `http://localhost:3100` is correct for local dev. The `.env.example` already warns to use `https://` in production. The actual production redirect URI is a deployment step that depends on SSL being active (see "Nginx serving HTTP only" above). Resolve alongside SSL activation.

### Nginx catch-all redirect preserves `$scheme` instead of hardcoding `https`
- **File**: infrastructure/nginx/kaivalo.com:125
- **Date**: 2026-02-19
- **Severity**: Low
- **Reason**: The entire nginx config currently runs HTTP-only (port 80, SSL commented out). Hardcoding `https` in the catch-all redirect before SSL is active would produce broken redirects. This fix is part of the SSL activation task — see "Nginx serving HTTP only" above. Resolve together when certbot issues certificates.

### ecosystem.config.cjs env parsing doesn't handle unterminated quotes
- **File**: apps/hub/ecosystem.config.cjs:13-14
- **Date**: 2026-02-18
- **Severity**: Low
- **Reason**: The current `.env` file contains no quoted values, so this edge case doesn't apply. The parser correctly handles the split-on-first-`=` case and matched quote stripping. Replacing with `dotenv` for a hypothetical edge case that doesn't occur would add a dependency for no practical benefit.
