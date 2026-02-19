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
