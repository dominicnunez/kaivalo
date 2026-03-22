### The cookie advisory allowlist is masking a repo-controlled dependency fix

**Location:** `2`

**Reason:** The allowlist entry reflects an existing upstream constraint that is already documented in `audit/exceptions/risks.md`.
Current registry metadata still reports `@sveltejs/kit@2.53.4` as the latest stable release, and it still depends on `cookie@^0.6.0`.
`pnpm audit --prod --json` still reports `fixAvailable: false`, so there is no in-repo package upgrade available to remove the advisory today.
The actionable repo-controlled work was to keep the exception accurate and continue monitoring upstream, not to remove the allowlist immediately.

### The dependency audit gate stays green because the active production advisory is allowlisted

**Location:** `2`

**Reason:** The audit missed the repo's existing review loop for this exception.
`docs/development.md` already documents that `pnpm run audit:deps` allows accepted upstream-only production advisories while failing new ones, and the exception is tracked in `audit/exceptions/risks.md`.
The repository also has a scheduled dependency monitor in `.github/workflows/dependency-sweep.yml` backed by `scripts/check-dependency-sweep.ts`, which opens or updates a tracking issue whenever direct dependency drift, new advisories, or a newer `@sveltejs/kit` release appears.
Because the exception is already documented and actively revisited, the audit's claim that the allowlist creates a false sense of security unless it is revisited is a misread of the current repo controls.
