# Audit Exceptions

> Items validated as false positives or accepted as won't-fix.
> Managed by willie audit loop. Do not edit format manually.

## False Positives

<!-- Items the auditor flagged but are not actual issues -->

## Won't Fix

### CSP img-src allows `https:` broadly
- **File**: apps/hub/src/hooks.server.ts
- **Severity**: Low
- **Reason**: WorkOS profile pictures come from whichever social provider the user authenticates with (Google, GitHub, Microsoft, etc.). The CDN domains are not enumerable upfront and change as WorkOS adds providers. Restricting to a static allowlist would break avatars for users of unlisted providers. The risk (pixel tracking via image requests) is low given that `connect-src` and `default-src` are already locked to `'self'`, so no data can be exfiltrated via fetch/XHR. Revisit if WorkOS documents a stable set of avatar CDN domains.

### CSP style-src allows `'unsafe-inline'`
- **File**: apps/hub/src/hooks.server.ts
- **Severity**: Medium
- **Reason**: 37 inline `style=` attributes across Svelte templates use CSS custom properties (`color: var(--text-muted)`, etc.) for theming. Migrating all to Tailwind arbitrary properties would be a disproportionate refactor. The inline JS event handlers that originally motivated this finding have been replaced with CSS `:hover` classes. Style injection (`style-src`) is far less dangerous than script injection — `script-src` remains locked to `'self'`. Revisit when migrating the design system to Tailwind-native theming.

### Nginx serving HTTP only — no SSL active
- **File**: infrastructure/nginx/kaivalo.com
- **Severity**: High
- **Reason**: SSL requires domain purchase and DNS propagation before certbot can issue certificates. The config includes commented-out SSL blocks and an HTTP-to-HTTPS redirect ready to activate. This is a known pre-launch state, not a misconfiguration. Rate limiting and server_tokens have been hardened in the meantime. Resolve before any real users hit the site.
