# Audit Exceptions

> Items validated as false positives or accepted as won't-fix.

## False Positives

### Nginx mechai subdomain lacks auth rate limiting

**Location:** `infrastructure/nginx/kaivalo.com:91`
**Date:** 2026-02-18

**Reason:** mechai.kaivalo.com has no auth routes. The finding flags a hypothetical future scenario and acknowledges "no action needed now" in its own suggested fix. There is no misconfiguration — rate limiting can be added if/when auth routes are introduced.

### Build output committed to repository

**Location:** `apps/hub/build/`
**Date:** 2026-02-18

**Reason:** Build output is NOT committed. `git ls-files` returns nothing for `apps/hub/build/` and `.gitignore` excludes `build/`. The audit acknowledged this but kept the finding anyway, pivoting to a secondary concern that `hub-auth-layout.test.js` asserts the build directory exists — which is normal build test behavior, not a code quality issue.

### Sign-out form has no CSRF token

**Location:** `apps/hub/src/routes/+layout.svelte:40-46`
**Date:** 2026-02-19

**Reason:** The audit claims "SvelteKit does not enforce CSRF on POST by default when Content-Type is application/x-www-form-urlencoded." This is factually wrong. SvelteKit's `csrf.checkOrigin` defaults to `true` and checks the `Origin` header on all form submissions regardless of Content-Type. The project's `svelte.config.js` does not override this default. The form is already protected by SvelteKit's built-in CSRF check.

### Security headers applied before auth — auth errors bypass CSP

**Location:** `apps/hub/src/hooks.server.ts:39`
**Date:** 2026-02-19

**Reason:** The audit claims `authKitHandle()` constructs new Response objects for redirects that bypass the `securityHeaders` handler. This is factually wrong. The `authKitHandle()` implementation (line 10522 of `@workos/authkit-sveltekit/dist/index.js`) calls `await resolve(event)` — it does not construct its own Response. In `sequence(securityHeaders, authKitHandle())`, securityHeaders wraps resolve, so its post-processing runs on ALL responses including those flowing through authKitHandle. Auth redirects use SvelteKit's `redirect()` throw, which is handled by SvelteKit's resolve chain, not by authKitHandle.

### sequence() hook ordering means security headers potentially overwritten

**Location:** `apps/hub/src/hooks.server.ts:39`
**Date:** 2026-02-19

**Reason:** Same root issue as above. The audit claims authKitHandle could overwrite security headers set by securityHeaders. In `sequence(securityHeaders, authKitHandle())`, securityHeaders runs *after* authKitHandle in the response path (it wraps resolve). securityHeaders always has the final say on headers. Additionally, authKitHandle only conditionally sets cookie headers for session refresh — it does not set CSP or any security headers.

### CSP does not include font-src for external font noscript fallback

**Location:** `apps/hub/src/hooks.server.ts:28`
**Date:** 2026-02-19

**Reason:** The audit acknowledges "the current config is correct" in its own details. The finding flags a hypothetical scenario where font providers change their CDN domains in the future. The CSP `font-src` correctly allows `https://cdn.fontshare.com` and `https://fonts.gstatic.com`, and `style-src` correctly allows `https://api.fontshare.com` and `https://fonts.googleapis.com`. All four domains match what `app.html` loads. This is speculative maintenance commentary, not an actual misconfiguration.

### vite.config.ts allowedHosts only includes production domain

**Location:** `apps/hub/vite.config.ts:8`
**Date:** 2026-02-19

**Reason:** The audit claims localhost and LAN IPs would be rejected by `preview.allowedHosts: ['kaivalo.com']`. This is factually wrong. Vite's docs state "localhost and domains under .localhost and all IP addresses are allowed by default" regardless of the allowedHosts array. The array only adds additional non-IP, non-localhost hostnames. localhost and 127.0.0.1 are never blocked.

### App.Locals auth type declared but allegedly unpopulated

**Location:** `apps/hub/src/app.d.ts:3-5` — App.Locals auth field
**Date:** 2026-02-19

**Reason:** The audit claims `authKitHandle()` does not populate `event.locals.auth`. This is factually wrong. The compiled `@workos/authkit-sveltekit` source (dist/index.js:10518) explicitly sets `event.locals.auth = createAuthKitAuth(authResult)` on every request, and falls back to `event.locals.auth = createEmptyAuth()` on error (line 10540). The `authKit.getUser()` helper also reads from `event.locals.auth` (line 10733). The type declaration in `app.d.ts` correctly reflects the library's runtime behavior.

### Avatar fallback shows blank for empty-string firstName and email

**Location:** `apps/hub/src/routes/+layout.svelte:36` — avatar initial letter fallback
**Date:** 2026-02-19

**Reason:** The audit claims `??` fails on empty string `""`, but the expression is `data.user.firstName?.[0] ?? data.user.email?.[0] ?? '?'`. In JavaScript, indexing an empty string (`""[0]`) returns `undefined`, not `""`. So nullish coalescing correctly falls through: if `firstName` is `""`, `firstName?.[0]` is `undefined`, and `??` moves to the next option. The `'?'` fallback is always reached when both fields are empty strings.

### Auth callback handleCallback called per request has no meaningful cost

**Location:** `apps/hub/src/routes/auth/callback/+server.ts:7` — handleCallback() inside GET handler
**Date:** 2026-02-19

**Reason:** The audit claims `handleCallback()` may do setup work (parsing config, creating clients) that gets repeated per request. The actual `@workos/authkit-sveltekit` implementation (dist/index.js, `createHandleCallback` at line 10800) is a lightweight double-wrapped factory — it returns an async function with no meaningful computation. There is no config parsing, client creation, or expensive setup. The per-call cost is a single function allocation, which is negligible.

### Card href regex allows path-relative javascript: string

**Location:** `packages/ui/Card.svelte:17` — safeHref regex
**Date:** 2026-02-19

**Reason:** A value like `/javascript:alert(1)` matches the regex (starts with `/` not followed by `/`), but browsers interpret it as a relative path, not a `javascript:` scheme. The regex correctly prevents the actual dangerous case — `javascript:` as a scheme at the start of the href. This is not an XSS vector.

### Button component class names from untrusted prop values

**Location:** `packages/ui/Button.svelte:22` — variant/size interpolation
**Date:** 2026-02-19

**Reason:** Svelte sets class via `element.className`, not HTML string concatenation, so arbitrary variant/size strings cannot cause attribute injection or XSS. TypeScript consumers are constrained to valid union types at compile time. The worst outcome is a nonsensical CSS class name with no visual effect.

### Noscript font fallback is render-blocking

**Location:** `apps/hub/src/app.html:15-19` — noscript font links
**Date:** 2026-02-19

**Reason:** The `<noscript>` block loads font stylesheets synchronously because `onload` tricks are unavailable without JavaScript. This is the standard and correct approach — the only alternative for noscript users would be to omit web fonts entirely. The main `<link>` tags use the async `media="print" onload` pattern for JS-enabled users.

## Intentional Design Decisions

### Page metadata uses hardcoded production URL for OpenGraph

**Location:** `apps/hub/src/routes/+page.ts:8-9`
**Date:** 2026-02-19

**Reason:** OG `url` and `image` must always reference the canonical production URL (`https://kaivalo.com`) regardless of which environment rendered the page. Using `event.url.origin` would produce `http://localhost:5173` in dev, which is wrong for OG previews and SEO canonical URLs. The production domain is the correct value to hardcode here.

### HSTS header set before SSL is active

**Location:** `apps/hub/src/hooks.server.ts:25` — Strict-Transport-Security header
**Date:** 2026-02-19

**Reason:** Per RFC 6797, browsers ignore HSTS over HTTP. The header is intentionally pre-configured so that security headers are complete when SSL activates — no code change needed at that point. Removing it would create a gap between SSL activation and remembering to add HSTS. Already tracked under the "Nginx serving HTTP only" won't-fix item.

### Container size prop falls back to lg for invalid values

**Location:** `packages/ui/Container.svelte:24-25` — sizeClasses fallback
**Date:** 2026-02-19

**Reason:** An invalid `size` value falls back to `sizeClasses.lg` via nullish coalescing. TypeScript enforces the `Size` union type at compile time, so runtime misuse only occurs from plain JavaScript consumers. Silently falling back to a sensible default is standard behavior for UI component props — it avoids runtime crashes in production while TypeScript catches misuse during development.

## Won't Fix

### CSP img-src allows `https:` broadly

**Location:** `apps/hub/src/hooks.server.ts`
**Date:** 2026-02-18

**Reason:** WorkOS profile pictures come from whichever social provider the user authenticates with (Google, GitHub, Microsoft, etc.). The CDN domains are not enumerable upfront and change as WorkOS adds providers. Restricting to a static allowlist would break avatars for users of unlisted providers. The risk (pixel tracking via image requests) is low given that `connect-src` and `default-src` are already locked to `'self'`, so no data can be exfiltrated via fetch/XHR. Revisit if WorkOS documents a stable set of avatar CDN domains.

### CSP style-src allows `'unsafe-inline'`

**Location:** `apps/hub/src/hooks.server.ts`
**Date:** 2026-02-18

**Reason:** 37 inline `style=` attributes across Svelte templates use CSS custom properties (`color: var(--text-muted)`, etc.) for theming. Migrating all to Tailwind arbitrary properties would be a disproportionate refactor. The inline JS event handlers that originally motivated this finding have been replaced with CSS `:hover` classes. Style injection (`style-src`) is far less dangerous than script injection — `script-src` remains locked to `'self'`. Revisit when migrating the design system to Tailwind-native theming.

### Nginx serving HTTP only — no SSL active

**Location:** `infrastructure/nginx/kaivalo.com`
**Date:** 2026-02-18

**Reason:** SSL requires domain purchase and DNS propagation before certbot can issue certificates. The config includes a commented-out HTTP-to-HTTPS redirect block and the certbot command in the header. This is a known pre-launch state, not a misconfiguration. Rate limiting and server_tokens have been hardened in the meantime. Resolve before any real users hit the site.

### Auth callback redirect URI uses HTTP in .env

**Location:** `apps/hub/.env` — gitignored
**Date:** 2026-02-18

**Reason:** The `.env` file is gitignored and not deployed — it's the local development config. `http://localhost:3100` is correct for local dev. The `.env.example` already warns to use `https://` in production. The actual production redirect URI is a deployment step that depends on SSL being active (see "Nginx serving HTTP only" above). Resolve alongside SSL activation.

### CSP missing upgrade-insecure-requests directive

**Location:** `apps/hub/src/hooks.server.ts:31-44`
**Date:** 2026-02-19

**Reason:** Adding `upgrade-insecure-requests` before SSL is active would have no effect — the directive tells browsers to upgrade HTTP sub-resource requests to HTTPS, but the site currently serves over HTTP only. Add this directive as part of SSL activation alongside the HTTPS redirect. See "Nginx serving HTTP only" above.

### Nginx catch-all redirect preserves `$scheme` instead of hardcoding `https`

**Location:** `infrastructure/nginx/kaivalo.com:125`
**Date:** 2026-02-19

**Reason:** The entire nginx config currently runs HTTP-only (port 80, SSL commented out). Hardcoding `https` in the catch-all redirect before SSL is active would produce broken redirects. This fix is part of the SSL activation task — see "Nginx serving HTTP only" above. Resolve together when certbot issues certificates.

### ecosystem.config.cjs env parsing doesn't handle unterminated quotes

**Location:** `apps/hub/ecosystem.config.cjs:13-14`
**Date:** 2026-02-18

**Reason:** The current `.env` file contains no quoted values, so this edge case doesn't apply. The parser correctly handles the split-on-first-`=` case and matched quote stripping. Replacing with `dotenv` for a hypothetical edge case that doesn't occur would add a dependency for no practical benefit.

### ecosystem.config.cjs silently ignores malformed .env lines

**Location:** `apps/hub/ecosystem.config.cjs:7-19`
**Date:** 2026-02-19

**Reason:** The parser skips blank lines, comments, and lines without `=` — this is standard `.env` parsing behavior, not silent data loss. The startup env var validation in `hooks.server.ts` now catches missing required vars immediately. Adding console.warn for skipped lines in a PM2 config file would produce noise in PM2 logs for every restart with no actionable benefit.

### ralph.sh uses eval to execute test command

**Location:** `ralph.sh:490` — gitignored
**Date:** 2026-02-19

**Reason:** ralph.sh is gitignored — it's a local development automation script not tracked in the repository. Fixes cannot be committed or enforced. The `eval` runs `TEST_CMD` which is either auto-detected from project config or set explicitly by the developer in their own config file. The threat model (developer injecting commands into their own local tool) has no practical attack surface. The finding is valid in principle but the file is outside version control scope.

### ralph.sh sources config files without validation

**Location:** `ralph.sh:151-156` — gitignored
**Date:** 2026-02-19

**Reason:** ralph.sh is gitignored and not tracked in the repository. The global config (`~/.config/ralph/ralph.env`) is self-healed by the script, and per-project configs (`.ralph/ralph.env`) are in `.gitignore`. A malicious `.ralph/ralph.env` in a cloned repo is a valid concern, but `.ralph/` is gitignored so it cannot arrive via git clone. Fixing would require replacing `source` with a key-value parser, but since the file is outside version control, the fix cannot be committed or enforced.

### ralph.sh mktemp failures not checked before use

**Location:** `ralph.sh:259, 760, 886` — gitignored
**Date:** 2026-02-19

**Reason:** ralph.sh is gitignored and not tracked in the repository. The mktemp calls are in a local development tool; `/tmp` exhaustion on a developer machine is an edge case that would surface as an immediate visible error. Fixes cannot be committed since the file is outside version control scope.

### Nginx proxy_pass without upstream health check

**Location:** `infrastructure/nginx/kaivalo.com:77` — hub and mechai proxy_pass directives
**Date:** 2026-02-19

**Reason:** Each backend has a single process behind `proxy_pass http://127.0.0.1:<port>`. An `upstream` block with `max_fails`/`fail_timeout` only helps when there are multiple backends to fail over to — with one backend, nginx has nowhere to retry. PM2 handles process restarts (now with `max_restarts` and `restart_delay`). Adding an `upstream` block for a single server adds configuration complexity with no resilience benefit. Revisit if scaling to multiple backend instances behind a load balancer.
