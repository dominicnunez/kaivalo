### Exact Node patch pinning blocks newer Node 24 patch releases

**Location:** `42`

**Reason:** `assertSupportedNodeVersion()` does reject `24.14.1` and other patch releases, but the repository deliberately enforces that exact patch-level alignment.
`package.json`, `pnpm-lock.yaml`, `Dockerfile`, GitHub workflow `node-version` settings, and `tests/node-version-alignment.test.ts` all pin and verify the same `24.14.0` runtime.
The audit described real behavior, but misclassified this reproducibility guardrail as an accidental compatibility bug.
