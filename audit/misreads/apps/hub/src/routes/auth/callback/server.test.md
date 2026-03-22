### Callback route tests never exercise the real helper failure path

**Location:** `55`

**Reason:** `apps/hub/src/routes/auth/callback/server.test.ts:55-72` does mock `authKit.handleCallback()`, but the repository already exercises real callback-helper failures elsewhere.
`tests/hub-workos-callback.test.ts:668-718` hits the real `/auth/callback` route with no callback parameters and verifies the sanitized incident redirect / 503 fallback behavior, and `tests/hub-workos-callback.test.ts:720-775` hits the real route with `?code=test-code&state=test-state` and verifies the real helper's failed code-exchange path.
Because the audit claimed the callback route tests never exercise the real helper failure path, it misread the existing integration coverage.
