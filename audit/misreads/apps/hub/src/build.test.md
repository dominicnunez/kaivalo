### Production build test is currently failing with missing manifest-full.js

**Location:** `31`

**Reason:** The current test file always runs the build assertion through `runBuildWithDiagnostics()`.
`pnpm --dir apps/hub run test -- src/build.test.ts` and `pnpm --dir apps/hub run test:build` both execute `src/build.test.ts` and pass in the current workspace.
The test file does not reference `manifest-full.js`, so the reported ENOENT does not match current code or reproduced runtime behavior.

### Production build is currently broken

**Location:** `N/A`

**Reason:** This does not reproduce in the current repository state.
Running `pnpm --dir apps/hub test` passes, including `src/build.test.ts`, and the build test successfully generates the documented Node/server artifacts.
The cited `manifest-full.js` ENOENT is not referenced by the current test file and did not occur during validation.
