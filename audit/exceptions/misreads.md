# Misreads

> Findings where the audit misread the code or described behavior that doesn't occur.
> Managed by sfk willie. Follow the entry format below.
>
> Entry format:
>
> ### Plain language description
>
> **Location:** `file/path:line` — optional context

> **Reason:** Explanation (can be multiple lines)

### Committed `.env` secrets were present in this repository

**Location:** `apps/hub/.env:2` — local file exists but is gitignored

**Reason:** The `.env` file is present locally, but it is not tracked in git (`git ls-files apps/hub/.env` returns no match).
Root `.gitignore` explicitly ignores `.env` and `.env.*` while allowing only `.env.example`.
No commit history exists for `apps/hub/.env`, so this is not a committed repository secret exposure.

### Production build test is currently failing with missing manifest-full.js

**Location:** `apps/hub/src/build.test.ts:31` — claim references ENOENT for `.svelte-kit/output/server/manifest-full.js`

**Date:** 2026-03-08

**Reason:** The current test file always runs the build assertion through `runBuildWithDiagnostics()`.
`npm --prefix apps/hub run test -- src/build.test.ts` and `npm --prefix apps/hub run test:build` both execute `src/build.test.ts` and pass in the current workspace.
The test file does not reference `manifest-full.js`, so the reported ENOENT does not match current code or reproduced runtime behavior.

### Docker builds upload the entire repository because no `.dockerignore` exists

**Location:** `.github/workflows/deploy.yml:69` — build uses `context: .`

**Date:** 2026-03-07

**Reason:** The repository already includes a root `.dockerignore`, so the audit's core premise is wrong.
`.dockerignore` currently excludes `node_modules`, `.svelte-kit`, `build`, `.env*`, `.git`, and `.github`.
There may still be room to tighten the build context further, but this finding is a false positive because it specifically claimed the file does not exist.

### Baseline security headers leave the app without any Content-Security-Policy

**Location:** `apps/hub/src/lib/server/workos-security.js:612` — baseline header helper

**Date:** 2026-03-07

**Reason:** `applyBaselineSecurityHeaders()` does not set `Content-Security-Policy`, but the app already configures CSP in `apps/hub/svelte.config.js:14`.
The audit's conclusion that this "leaves the app without a browser-enforced script and resource policy" is therefore incorrect for the current app.
There may still be a narrower question about raw Node-generated responses outside SvelteKit's CSP handling, but that is not the behavior this finding described.

### Startup tests never exercise asynchronous bind failures like EADDRINUSE

**Location:** `tests/hub-node-server-port-validation.test.js:49` — report overlooked broader startup coverage in the main node server suite

**Date:** 2026-03-07

**Reason:** The claim says the current test suite never exercises asynchronous `server.listen()` failures.
That is incorrect: `tests/hub-node-server.test.js:664` already reserves a local port, calls `startHubServer()` with that occupied port, waits for the fatal event, and asserts the controlled startup-failure path.
The narrower `tests/hub-node-server-port-validation.test.js` file does focus on synchronous validation failures, but the audit described a suite-wide coverage gap that does not exist.

### The cookie advisory allowlist is masking a repo-controlled dependency fix

**Location:** `audit/exceptions/npm-audit-allowlist.json:2` — allowlisted `cookie` advisory in production audit gating

**Reason:** The allowlist entry reflects an existing upstream constraint that is already documented in `audit/exceptions/risks.md`.
Current registry metadata still reports `@sveltejs/kit@2.53.4` as the latest stable release, and it still depends on `cookie@^0.6.0`.
`npm audit --omit=dev --json` still reports `fixAvailable: false`, so there is no in-repo package upgrade available to remove the advisory today.
The actionable repo-controlled work was to keep the exception accurate and continue monitoring upstream, not to remove the allowlist immediately.

### The dependency audit gate stays green because the active production advisory is allowlisted

**Location:** `audit/exceptions/npm-audit-allowlist.json:2` — allowlisted `cookie` advisory in production audit gating

**Reason:** The audit missed the repo's existing review loop for this exception.
`docs/development.md` already documents that `npm run audit:deps` allows accepted upstream-only production advisories while failing new ones, and the exception is tracked in `audit/exceptions/risks.md`.
The repository also has a scheduled upstream monitor in `.github/workflows/track-sveltekit-upstream.yml` backed by `scripts/check-sveltekit-upstream.mjs`, which opens or updates a tracking issue whenever a newer `@sveltejs/kit` release appears.
Because the exception is already documented and actively revisited, the audit's claim that the allowlist creates a false sense of security unless it is revisited is a misread of the current repo controls.

### Test auth fixture return-to headers create an open redirect

**Location:** `apps/hub/src/lib/server/authkit-runtime.ts:165` — fixture callback and sign-out handlers copy caller-supplied return targets into `Location`

**Reason:** The audit stopped at `authkit-runtime.ts` and missed the actual route handlers that serve these responses.
`apps/hub/src/routes/auth/callback/+server.ts` wraps the fixture callback handler with `createAuthCallbackGetHandler()`, and `apps/hub/src/lib/auth/callback-handler.js:63` normalizes redirect responses to same-origin targets and rejects external locations.
`apps/hub/src/routes/auth/sign-out/+server.ts` wraps fixture sign-out through `createSignOutPostHandler()`, and `apps/hub/src/lib/auth/sign-out-handler.js:166` applies the same same-origin redirect normalization or rejects invalid locations.
Because the exported route paths always pass through those wrappers, the externally observable open-redirect behavior described in the audit does not actually occur.

### Node-server test still documents a removed debug env toggle

**Location:** `tests/hub-node-server.test.js:147` — production redaction test that sets `KAIVALO_INCLUDE_SENSITIVE_ERROR_LOGS`

**Reason:** The audit misread the test’s intent.
The runtime no longer reads `KAIVALO_INCLUDE_SENSITIVE_ERROR_LOGS`, and the test explicitly verifies that setting the legacy variable does not disable production redaction.
That is not stale documentation for a live runtime switch; it is a regression test confirming the legacy toggle is ignored.

### Production build is currently broken

**Location:** `apps/hub/package.json:7` — build is exercised by `apps/hub/src/build.test.ts`

**Reason:** This does not reproduce in the current repository state.
Running `npm test` in `apps/hub` passes, including `src/build.test.ts`, and the build test successfully generates the documented Node/server artifacts.
The cited `manifest-full.js` ENOENT is not referenced by the current test file and did not occur during validation.

### Invalid WorkOS runtime configuration is silently downgraded into a generic auth outage

**Location:** `apps/hub/src/routes/+layout.server.ts:25` — report omitted startup validation in `apps/hub/src/hooks.server.ts:17`

**Reason:** The layout helper does catch `getValidatedWorkosEnv(env)` failures and return an empty trusted-origin set, but the app already validates the same WorkOS configuration at module load in `hooks.server.ts` before request handling.
Invalid `WORKOS_*` or `ORIGIN` values throw during startup via `getValidatedWorkosEnv(env)` and `configureAuthKit(...)`, so the claimed runtime-misconfiguration path does not occur in the real app flow.
What remains is a narrower transient/build-analysis fallback path, not the generic production outage behavior described by the audit.

### The auth layout fallback for upstream AuthKit failures is not covered by tests

**Location:** `apps/hub/src/routes/+layout.server.ts:157` — broad catch branch in layout load

**Reason:** The report says the fallback branch that logs, forces `private, no-store`, and returns a sanitized auth error is untested.
That is incorrect: `apps/hub/src/routes/layout.test.ts:419` already makes `authKit.getUser()` reject, then asserts the sanitized `authError`, the `cache-control` and `vary` headers, and the logged `AUTH_LAYOUT_UNEXPECTED_FAILURE` context.
The cited catch path is therefore already exercised by the current suite.

### The hook tests preserve an app-wide missing Content Security Policy

**Location:** `tests/hub-workos-hooks.test.js:444` — helper-level security header assertion

**Reason:** The report treats `assert.strictEqual(response.headers.get('Content-Security-Policy'), null)` as proof that the suite locks in a missing browser CSP for real HTML responses.
That misreads the current layering: the helper-level test only asserts that `createSecurityHeadersHandle()` itself does not add CSP, while real app responses already receive CSP from SvelteKit config in `apps/hub/svelte.config.js:10`.
`tests/hub-workos-hooks.test.js:985` and `tests/hub-workos-hooks.test.js:1030` already verify that preview-served HTML and framework-generated 500 pages include the expected `Content-Security-Policy` header.
So the suite is not preserving the app-wide gap the audit described.

### Hook and WorkOS tests are redundant with lower-level validator coverage

**Location:** `tests/hub-workos-hooks.test.js:61` — environment and proxy validation assertions

**Reason:** The report says this file mostly duplicates existing lower-level coverage in dedicated `workos-security` and startup suites, but the current codebase does not support that claim.
`apps/hub/src/lib/server/workos-security.test.js` covers static-asset policy, protocol checks, and a small hostname/proto subset; it does not replicate the broad missing-env, callback-path, origin-matching, loopback, or proxy-trust cases asserted here.
`apps/hub/src/hooks.server.test.ts` exercises hook behavior and one startup failure path, not the validator matrix in this file.
The audit therefore overstates duplication and describes an already-covered gap that does not actually exist.

### Sign-out route unit test only duplicates broader sign-out coverage and checks no unique behavior

**Location:** `apps/hub/src/routes/auth/sign-out/server.test.ts:36`

**Reason:** The audit missed the route-specific contract this test actually covers.
`apps/hub/src/routes/auth/sign-out/+server.ts` derives `allowedRedirectOrigins` from validated env via `getTrustedWorkosAuthOrigin(workosEnv)`, and this test verifies that a redirect to the configured auth host `auth.kaivalo-login.com` is preserved through the real route wrapper.
The broader `tests/hub-sign-out.test.js` suite exercises CSRF, redirect normalization, and generic allowed-origin behavior, but it does not verify this route-level env-to-handler wiring for a custom `WORKOS_API_HOSTNAME`.

### Vulnerable production cookie dependency is still shipped through @sveltejs/kit

**Location:** `package-lock.json:1417`

**Reason:** The lockfile does resolve `cookie` through `@sveltejs/kit`, but this item is already an upstream-only exception rather than a repo-controlled defect.
The current `@sveltejs/kit` release in the workspace still declares `cookie@^0.6.0`, and the report itself notes that no direct fix is available.
Because there is no durable in-repo remediation path today beyond waiting for the upstream dependency update, keeping this in `audit/report.md` misclassifies an accepted upstream constraint as an active repository finding.

### Public API smoke test only re-checks component rendering already covered elsewhere

**Location:** `apps/hub/src/ui-public-api.test.ts:10`

**Reason:** This test does more than duplicate the direct component tests.
`apps/hub/src/ui-public-api.test.ts` imports `Button`, `Badge`, `Card`, and `Container` from the package root `@kaivalo/ui`, while `apps/hub/src/ui-components.test.ts` imports the Svelte files directly from `packages/ui`.
That means the public-API test uniquely verifies the package barrel exports and consumer import surface, which normal component rendering tests and the current app build do not fully cover.
