# Misreads

> Findings where the audit misread the code or described behavior that doesn't occur.
> Managed by sfk willie. Follow the entry format below.
>
> Entry format:
> ### Plain language description
> **Location:** `file/path:line` — optional context
> **Date:** YYYY-MM-DD
> **Reason:** Explanation (can be multiple lines)

### WorkOS credentials are committed in the repository

**Location:** `apps/hub/.env:2` — local file exists but is gitignored
**Date:** 2026-03-06

**Reason:** The `.env` file is present locally, but it is not tracked in git (`git ls-files apps/hub/.env` returns no match).
Root `.gitignore` explicitly ignores `.env` and `.env.*` while allowing only `.env.example`.
No commit history exists for `apps/hub/.env`, so this is not a committed repository secret exposure.

### Production build test is currently failing with missing manifest-full.js

**Location:** `apps/hub/src/build.test.ts:9` — claim references ENOENT for `.svelte-kit/output/server/manifest-full.js`
**Date:** 2026-03-06

**Reason:** The referenced test currently runs `npm run build` and passes.
`npm --prefix apps/hub run test -- src/build.test.ts` succeeds (1/1 tests passing), and the test file does not reference `manifest-full.js`.
The reported failure mode does not match current code or current runtime behavior.

### Secret-leak guard test allowed committed .env secrets in this repository

**Location:** `tests/hub-workos-install.test.js:70` — local `.env` handling test
**Date:** 2026-03-06

**Reason:** The test is weak as a repository secret guard, but the claim that it allowed a committed `.env` secret in this repo is incorrect.
`apps/hub/.env` is not tracked (`git ls-files apps/hub/.env` has no match), and root `.gitignore` ignores `.env` and `.env.*` while allowing only `.env.example`.
No commit history exists for `apps/hub/.env`, so the described committed-secret event did not occur.
