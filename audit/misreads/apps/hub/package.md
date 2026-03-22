### Production build is currently broken

**Location:** `7`

**Reason:** This does not reproduce in the current repository state.
Running `pnpm --dir apps/hub test` passes, including `src/build.test.ts`, and the build test successfully generates the documented Node/server artifacts.
The cited `manifest-full.js` ENOENT is not referenced by the current test file and did not occur during validation.
