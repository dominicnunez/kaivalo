### Runtime build packaging leaves stale server helpers in deploy artifacts

**Location:** `9`

**Reason:** The audit stopped at `prepare-runtime.ts` and missed the surrounding build behavior.
`pnpm --dir apps/hub run build` runs `vite build` before `node scripts/prepare-runtime.ts`, and the real build clears `apps/hub/build` before the runtime helper copy step.
Seeding `apps/hub/build/runtime/server/__audit_stale_helper__.ts` and then running `HUB_BUILD_ALLOW_PLACEHOLDERS=true pnpm --dir apps/hub run build` removed the stale file, so the obsolete helper does not persist into the artifact later copied by `Dockerfile`.
