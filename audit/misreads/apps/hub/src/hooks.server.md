### Invalid WorkOS runtime configuration is silently downgraded into a generic auth outage

**Location:** `17`

**Reason:** The layout helper does catch `getValidatedWorkosEnv(env)` failures and return an empty trusted-origin set, but the app already validates the same WorkOS configuration at module load in `hooks.server.ts` before request handling.
Invalid `WORKOS_*` or `ORIGIN` values throw during startup via `getValidatedWorkosEnv(env)` and `configureAuthKit(...)`, so the claimed runtime-misconfiguration path does not occur in the real app flow.
What remains is a narrower transient/build-analysis fallback path, not the generic production outage behavior described by the audit.
