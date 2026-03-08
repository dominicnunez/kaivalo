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
