### Test auth fixture return-to headers create an open redirect

**Location:** `1`

**Reason:** The audit stopped at `authkit-runtime.ts` and missed the actual route handlers that serve these responses.
`apps/hub/src/routes/auth/callback/+server.ts` wraps the fixture callback handler with `createAuthCallbackGetHandler()`, and `apps/hub/src/lib/auth/callback-handler.ts:112` normalizes redirect responses to same-origin targets and rejects external locations.
`apps/hub/src/routes/auth/sign-out/+server.ts` wraps fixture sign-out through `createSignOutPostHandler()`, and `apps/hub/src/lib/auth/sign-out-handler.ts:195` applies the same same-origin redirect normalization or rejects invalid locations.
Because the exported route paths always pass through those wrappers, the externally observable open-redirect behavior described in the audit does not actually occur.
