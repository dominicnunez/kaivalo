# Risks

> Real findings consciously accepted — architectural cost, external constraints, disproportionate effort.
> Managed by sfk willie. Follow the entry format below.
>
> Entry format:
> ### Plain language description
> **Location:** `file/path:line` — optional context
> **Date:** YYYY-MM-DD
> **Reason:** Explanation (can be multiple lines)

### A large share of repository tests still check source structure instead of runtime behavior

**Location:** `tests/*.test.js` — remaining legacy smoke tests
**Date:** 2026-03-06

**Reason:** This session moved the high-value landing-page/runtime suites to preview-based behavior checks and removed import-time network probes.
A full rewrite of all remaining legacy source-structure tests would still be disproportionate for this session because those files are broad, low-risk smoke guards rather than critical auth/runtime paths.

### The SvelteKit dependency tree still resolves cookie 0.6.0 from upstream

**Location:** `package-lock.json:1224` — `@sveltejs/kit@2.53.4` depends on `cookie@^0.6.0`
**Date:** 2026-03-07

**Reason:** `npm audit --omit=dev` reports GHSA-pxg6-pf52-xh8x against the transitive `cookie` dependency through `@sveltejs/kit`, and currently reports `fixAvailable: false`.
This is an upstream dependency constraint rather than an application-code defect: the latest published `@sveltejs/kit` in use here still depends on `cookie@^0.6.0`.
Forcing an in-repo override would not be a durable fix and risks drifting from upstream package expectations.
The sustainable remediation is to adopt the upstream dependency update once `@sveltejs/kit` moves to `cookie >= 0.7.0`, then remove this exception.
