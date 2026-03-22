### The SvelteKit dependency tree still resolves cookie 0.6.0 from upstream

**Location:** `N/A`

**Reason:** `pnpm audit --json` reports GHSA-pxg6-pf52-xh8x against the transitive `cookie` dependency through `@sveltejs/kit`, and currently reports `fixAvailable: false`.
This is an upstream dependency constraint rather than an application-code defect: the latest published `@sveltejs/kit` in use here still depends on `cookie@^0.6.0`.
Forcing an in-repo override would not be a durable fix and risks drifting from upstream package expectations.
The sustainable remediation is to adopt the upstream dependency update once `@sveltejs/kit` moves to `cookie >= 0.7.0`, then remove this exception.
