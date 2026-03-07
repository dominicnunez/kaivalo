# Misreads

> Findings where the audit misread the code or described behavior that doesn't occur.
> Managed by sfk willie. Follow the entry format below.
>
> Entry format:
>
> ### Plain language description
>
> **Location:** `file/path:line` — optional context
> **Date:** YYYY-MM-DD
> **Reason:** Explanation (can be multiple lines)

### Committed `.env` secrets were present in this repository

**Location:** `apps/hub/.env:2` — local file exists but is gitignored
**Date:** 2026-03-06

**Reason:** The `.env` file is present locally, but it is not tracked in git (`git ls-files apps/hub/.env` returns no match).
Root `.gitignore` explicitly ignores `.env` and `.env.*` while allowing only `.env.example`.
No commit history exists for `apps/hub/.env`, so this is not a committed repository secret exposure.

### Production build test is currently failing with missing manifest-full.js

**Location:** `apps/hub/src/build.test.ts:9` — claim references ENOENT for `.svelte-kit/output/server/manifest-full.js`
**Date:** 2026-03-06

**Reason:** The referenced test only runs the build assertion when `RUN_BUILD_TESTS=1`.
`npm --prefix apps/hub run test -- src/build.test.ts` currently skips the test by default, while `npm --prefix apps/hub run test:build` runs the build assertion and passes.
The test file does not reference `manifest-full.js`, so the reported ENOENT does not match current code or current runtime behavior.
