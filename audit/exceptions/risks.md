# Risks

> Real findings consciously accepted — architectural cost, external constraints, disproportionate effort.
> Managed by sfk willie. Follow the entry format below.
>
> Entry format:
> ### Plain language description
> **Location:** `file/path:line` — optional context
> **Date:** YYYY-MM-DD
> **Reason:** Explanation (can be multiple lines)

### The SvelteKit dependency tree still resolves cookie 0.6.0 from upstream

**Location:** `package-lock.json:1224` — `@sveltejs/kit@2.53.4` depends on `cookie@^0.6.0`
**Date:** 2026-03-07

**Reason:** `npm audit --omit=dev` reports GHSA-pxg6-pf52-xh8x against the transitive `cookie` dependency through `@sveltejs/kit`, and currently reports `fixAvailable: false`.
This is an upstream dependency constraint rather than an application-code defect: the latest published `@sveltejs/kit` in use here still depends on `cookie@^0.6.0`.
Forcing an in-repo override would not be a durable fix and risks drifting from upstream package expectations.
The sustainable remediation is to adopt the upstream dependency update once `@sveltejs/kit` moves to `cookie >= 0.7.0`, then remove this exception.
