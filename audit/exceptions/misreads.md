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

**Location:** `apps/hub/src/lib/server/workos-security-cache.ts:410` — baseline header helper

**Date:** 2026-03-07

**Reason:** `applyBaselineSecurityHeaders()` does not set `Content-Security-Policy`, but the app already configures CSP in `apps/hub/svelte.config.js:14`.
The audit's conclusion that this "leaves the app without a browser-enforced script and resource policy" is therefore incorrect for the current app.
There may still be a narrower question about raw Node-generated responses outside SvelteKit's CSP handling, but that is not the behavior this finding described.

### Startup tests never exercise asynchronous bind failures like EADDRINUSE

**Location:** `tests/hub-node-server-port-validation.test.ts:49` — report overlooked broader startup coverage in the main node server suite

**Date:** 2026-03-07

**Reason:** The claim says the current test suite never exercises asynchronous `server.listen()` failures.
That is incorrect: `tests/hub-node-server.test.ts:870` already reserves a local port, calls `startHubServer()` with that occupied port, waits for the fatal event, and asserts the controlled startup-failure path.
The narrower `tests/hub-node-server-port-validation.test.ts` file does focus on synchronous validation failures, but the audit described a suite-wide coverage gap that does not exist.

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
The repository also has a scheduled upstream monitor in `.github/workflows/track-sveltekit-upstream.yml` backed by `scripts/check-sveltekit-upstream.ts`, which opens or updates a tracking issue whenever a newer `@sveltejs/kit` release appears.
Because the exception is already documented and actively revisited, the audit's claim that the allowlist creates a false sense of security unless it is revisited is a misread of the current repo controls.

### Test auth fixture return-to headers create an open redirect

**Location:** `apps/hub/src/routes/auth/callback/+server.ts:1` — fixture callback and sign-out behavior is only exposed through the route wrappers

**Reason:** The audit stopped at `authkit-runtime.ts` and missed the actual route handlers that serve these responses.
`apps/hub/src/routes/auth/callback/+server.ts` wraps the fixture callback handler with `createAuthCallbackGetHandler()`, and `apps/hub/src/lib/auth/callback-handler.ts:112` normalizes redirect responses to same-origin targets and rejects external locations.
`apps/hub/src/routes/auth/sign-out/+server.ts` wraps fixture sign-out through `createSignOutPostHandler()`, and `apps/hub/src/lib/auth/sign-out-handler.ts:195` applies the same same-origin redirect normalization or rejects invalid locations.
Because the exported route paths always pass through those wrappers, the externally observable open-redirect behavior described in the audit does not actually occur.

### Node-server test still documents a removed debug env toggle

**Location:** `tests/hub-node-server.test.ts:244` — production redaction test that sets `KAIVALO_INCLUDE_SENSITIVE_ERROR_LOGS`

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

### DEV_AUTH_BYPASS can activate with malformed local WorkOS URLs that normal runtime validation would reject

**Location:** `apps/hub/src/routes/+layout.server.ts:42` — bypass precondition in `isLoopbackOrigin()`

**Reason:** The bypass helper itself only checks for a loopback hostname, so in isolation it would accept values like `ftp://localhost/...` or callback URLs outside `/auth/callback`.
That is not the real application behavior, because `apps/hub/src/hooks.server.ts:18` calls `getValidatedWorkosEnv(env)` during startup before requests are served.
The shared validator in `apps/hub/src/lib/server/workos-security-env.ts:217` rejects non-HTTP(S) schemes, callback URLs outside `/auth/callback`, query/hash components, and non-equivalent local origins, so the audit's claim that bypass mode "can still activate" in the running app is factually wrong.

### The hook tests preserve an app-wide missing Content Security Policy

**Location:** `tests/hub-workos-hooks.test.ts:456` — helper-level security header assertion

**Reason:** The report treats `assert.strictEqual(response.headers.get('Content-Security-Policy'), null)` as proof that the suite locks in a missing browser CSP for real HTML responses.
That misreads the current layering: the helper-level test only asserts that `createSecurityHeadersHandle()` itself does not add CSP, while real app responses already receive CSP from SvelteKit config in `apps/hub/svelte.config.js:10`.
`tests/hub-workos-hooks.test.ts:983` and `tests/hub-workos-hooks.test.ts:1043` already verify that preview-served HTML and framework-generated 500 pages include the expected `Content-Security-Policy` header.
So the suite is not preserving the app-wide gap the audit described.

### Hook and WorkOS tests are redundant with lower-level validator coverage

**Location:** `tests/hub-workos-hooks.test.ts:61` — environment and proxy validation assertions

**Reason:** The report says this file mostly duplicates existing lower-level coverage in dedicated `workos-security` and startup suites, but the current codebase does not support that claim.
`apps/hub/src/lib/server/workos-security.test.ts` covers static-asset policy, protocol checks, and a small hostname/proto subset; it does not replicate the broad missing-env, callback-path, origin-matching, loopback, or proxy-trust cases asserted here.
`apps/hub/src/hooks.server.test.ts` exercises hook behavior and one startup failure path, not the validator matrix in this file.
The audit therefore overstates duplication and describes an already-covered gap that does not actually exist.

### Sign-out route unit test only duplicates broader sign-out coverage and checks no unique behavior

**Location:** `apps/hub/src/routes/auth/sign-out/server.test.ts:36`

**Reason:** The audit missed the route-specific contract this test actually covers.
`apps/hub/src/routes/auth/sign-out/+server.ts` derives `allowedRedirectOrigins` from validated env via `getTrustedWorkosAuthOrigin(workosEnv)`, and this test verifies that a redirect to the configured auth host `auth.kaivalo-login.com` is preserved through the real route wrapper.
The broader `tests/hub-sign-out.test.ts` suite exercises CSRF, redirect normalization, and generic allowed-origin behavior, but it does not verify this route-level env-to-handler wiring for a custom `WORKOS_API_HOSTNAME`.

### Vulnerable production cookie dependency is still shipped through @sveltejs/kit

**Location:** `package-lock.json:1417`

**Reason:** The lockfile does resolve `cookie` through `@sveltejs/kit`, but this item is already an upstream-only exception rather than a repo-controlled defect.
The current `@sveltejs/kit` release in the workspace still declares `cookie@^0.6.0`, and the report itself notes that no direct fix is available.
Because there is no durable in-repo remediation path today beyond waiting for the upstream dependency update, keeping this in `audit/report.md` misclassifies an accepted upstream constraint as an active repository finding.

### Public API smoke test only re-checks component rendering already covered elsewhere

**Location:** `packages/ui/index.test.ts:10`

**Reason:** This test does more than duplicate the direct component tests.
`packages/ui/index.test.ts` imports `Button`, `Badge`, `Card`, and `Container` from the package root `./index.ts`.
That means the public-API test uniquely verifies the package barrel exports and consumer import surface, which a plain build or direct component render does not fully cover.

### Shared preview helper can leave detached test servers running after abrupt exits

**Location:** `tests/helpers/hub-preview.ts:150` — `process.once('exit', ...)` cleanup for shared preview

**Reason:** The audit conflated two different `stop()` paths.
`process.once('exit', () => { void sharedPreview?.stop(); })` calls the underlying shared preview object's `stop`, which is `stopServer()` from `createHubPreview()`, not the lease-level `stop()` that defers shutdown behind `SHARED_PREVIEW_IDLE_SHUTDOWN_MS`.
That underlying `stopServer()` sends `SIGTERM` to the detached process group synchronously before its first `await`, so the reported idle-timer-based orphaning path does not match the actual code.

### Startup path contains a dead HOST assignment

**Location:** `apps/hub/src/lib/server/node-server-runtime.ts:571` — startup host normalization before `parseHost(env.HOST)`

**Reason:** The audit called `host = env.HOST.trim()` dead because the next line assigns `host = parseHost(env.HOST)`.
That misses the surrounding `try`/`catch`: if `parseHost(env.HOST)` throws, control jumps to `handleStartupError(error)` before the second assignment completes.
In that failure path, `handleStartupError()` logs and reports the current `host` value, so the trim step preserves the caller-supplied HOST for fatal diagnostics instead of falling back to the default `127.0.0.1`.
The assignment may be debatable style, but it is not dead code and the behavior described by the audit does not match the actual control flow.

### The shared UI package declares Tailwind as a required peer without using it

**Location:** `packages/ui/package.json:21` — Tailwind peer dependency for `@kaivalo/ui`

**Reason:** The package does rely on Tailwind-generated output.
`packages/ui/Container.svelte` renders utility classes such as `w-full`, `mx-auto`, `px-4`, `sm:px-6`, `lg:px-8`, and `max-w-screen-*`, so consumers need Tailwind available for that component to render correctly.
Because the source itself ships Tailwind utility class names, the `tailwindcss` peer dependency is not dead or unnecessary configuration.

### Framework-served HTTPS responses lose HSTS when trusted proxy forwarding rewrites `getClientAddress()`

**Location:** `apps/hub/src/lib/server/workos-security-cache.ts:134` — hook-level secure-request detection

**Reason:** The hook helper does compare `event.getClientAddress()` against `TRUSTED_PROXY_IPS`, and the runtime docs say `ADDRESS_HEADER=x-forwarded-for` with `XFF_DEPTH` makes `getClientAddress()` resolve to the real client IP.
But the shipped app does not rely on that hook decision to emit HSTS for production traffic.
`apps/hub/server.ts` starts the custom Node server, and that runtime applies baseline security headers from the raw socket layer via `evaluateSecureRequest()` in `apps/hub/src/lib/server/node-server-request.ts` and `createHubServer()` in `apps/hub/src/lib/server/node-server-runtime.ts`.
That means trusted proxied HTTPS requests still receive HSTS in the deployed server path even when SvelteKit rewrites `getClientAddress()`, so the runtime regression described by the audit does not actually occur.

### Avatar rate limiting can be spoofed because trusted-proxy mode does not enforce SvelteKit client-IP adapter settings

**Location:** `apps/hub/src/routes/avatar/+server.ts:330` — avatar rate-limit key derivation

**Reason:** The route does not trust arbitrary client-supplied `x-forwarded-for` values.
`getAvatarRateLimitKey()` delegates to `getTrustedClientAddress()`, which only consults the forwarded chain when the direct peer IP is itself in `TRUSTED_PROXY_IPS`, canonicalizes every hop, rejects malformed chains entirely, and then walks the chain from the right to strip only trusted proxies.
That means the absence of `ADDRESS_HEADER` or `XFF_DEPTH` does not create the spoofable bucket-key path described in the audit, because this route already reconstructs the client address from the trusted proxy allowlist instead of trusting the left-most forwarded hop.
When forwarded data is malformed, the code falls back to the shared empty-key bucket rather than accepting an attacker-chosen client address.

### Runtime build packaging leaves stale server helpers in deploy artifacts

**Location:** `apps/hub/scripts/prepare-runtime.ts:9` — runtime helper copy step

**Reason:** The audit stopped at `prepare-runtime.ts` and missed the surrounding build behavior.
`npm --prefix apps/hub run build` runs `vite build` before `node scripts/prepare-runtime.ts`, and the real build clears `apps/hub/build` before the runtime helper copy step.
Seeding `apps/hub/build/runtime/server/__audit_stale_helper__.ts` and then running `HUB_BUILD_ALLOW_PLACEHOLDERS=true npm --prefix apps/hub run build` removed the stale file, so the obsolete helper does not persist into the artifact later copied by `Dockerfile`.

### Loopback-IP HTTP auth flows can never persist the WorkOS cookies

**Location:** `apps/hub/src/lib/server/workos-auth.ts:124` and `apps/hub/src/lib/server/workos-security-env.ts:240`

**Reason:** The audit's browser-behavior claim is wrong.
Direct validation with headless Chromium 145.0.7632.116 showed both the `__Secure-wos_callback_state` cookie and the `__Host-wos_session` cookie were accepted and sent back over plain `http://127.0.0.1` and `http://[::1]`.
The repo's allowed loopback-IP auth flows therefore do not "can never persist" these cookies in the current browser runtime.

### Exact Node patch pinning blocks newer Node 24 patch releases

**Location:** `scripts/check-node-version.ts:42` — runtime preflight compared against the repo-pinned Docker/CI patch version

**Reason:** `assertSupportedNodeVersion()` does reject `24.14.1` and other patch releases, but the repository deliberately enforces that exact patch-level alignment.
`package.json`, `package-lock.json`, `Dockerfile`, GitHub workflow `node-version` settings, and `tests/node-version-alignment.test.ts` all pin and verify the same `24.14.0` runtime.
The audit described real behavior, but misclassified this reproducibility guardrail as an accidental compatibility bug.

### Real WorkOS sign-out handling only exercises the happy path

**Location:** `apps/hub/src/lib/server/workos-auth.test.ts:85` — configured sign-out handler coverage

**Reason:** The audit missed existing failure-path coverage for the configured WorkOS sign-out flow.
`tests/hub-preview-script.test.ts:480` starts the real preview app, signs in through the callback route, then exercises `/auth/sign-out` while `tests/helpers/hub-preview-fixtures.mts:212` patches `AuthService.prototype.signOut` to throw.
That path goes through the actual configured sign-out handler and already asserts the sanitized `503` response and that no cookies are leaked on failure.
A narrower gap around malformed logout response contracts may still exist, but the report's claim that real sign-out handling only covers the happy path is factually wrong.

### Avatar proxy double-buffers every successful image body

**Location:** `apps/hub/src/routes/avatar/+server.ts:357` — avatar body buffering

**Reason:** The audit missed the existing fast path in `joinAvatarChunks()`.
`readAvatarBody()` always collects chunks into `chunks[]`, but `joinAvatarChunks()` returns the original chunk unchanged when the response arrives as a single chunk and only allocates a second `Uint8Array` when there are multiple chunks.
That means the claimed "every successful image body" double-buffering behavior does not actually occur in the current implementation.

### Homepage link smoke test duplicates stronger coverage and checks no unique behavior

**Location:** `tests/hub-links.test.ts:15`

**Reason:** The audit misdescribed what this suite asserts.
`tests/hub-links.test.ts` does not merely check that the homepage contains some safe link; it iterates every rendered `a[href]` on the preview homepage and fails if any link is empty or starts with `javascript:`.
The existing `tests/hub-auth-landing.test.ts` and page-level component suites cover trusted sign-in and `/services` actions, but they do not provide that whole-page anchor hygiene check.
Because the suite still verifies behavior not covered elsewhere, the claim that it only duplicates stronger coverage is a false positive.

### Build freshness coverage misses stale runtime artifact cleanup

**Location:** `tests/hub-build-freshness.test.ts:14` — build freshness regression coverage

**Reason:** The current test does not seed an obsolete runtime helper, but the claimed regression path depends on a packaging bug that does not occur in the current build.
Because the real hub build clears `apps/hub/build` before `prepare-runtime.ts` copies the allowlisted runtime files, the stale-helper scenario described in the audit could not be reproduced and is not an uncovered behavior gap in this test suite.

### Callback route tests never exercise the real helper failure path

**Location:** `apps/hub/src/routes/auth/callback/server.test.ts:55` — report missed broader callback failure coverage outside the mocked unit suite

**Reason:** `apps/hub/src/routes/auth/callback/server.test.ts:55-72` does mock `authKit.handleCallback()`, but the repository already exercises real callback-helper failures elsewhere.
`tests/hub-workos-callback.test.ts:668-718` hits the real `/auth/callback` route with no callback parameters and verifies the sanitized incident redirect / 503 fallback behavior, and `tests/hub-workos-callback.test.ts:720-775` hits the real route with `?code=test-code&state=test-state` and verifies the real helper's failed code-exchange path.
Because the audit claimed the callback route tests never exercise the real helper failure path, it misread the existing integration coverage.
