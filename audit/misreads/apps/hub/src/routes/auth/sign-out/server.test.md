### Sign-out route unit test only duplicates broader sign-out coverage and checks no unique behavior

**Location:** `36`

**Reason:** The audit missed the route-specific contract this test actually covers.
`apps/hub/src/routes/auth/sign-out/+server.ts` derives `allowedRedirectOrigins` from validated env via `getTrustedWorkosAuthOrigin(workosEnv)`, and this test verifies that a redirect to the configured auth host `auth.kaivalo-login.com` is preserved through the real route wrapper.
The broader `tests/hub-sign-out.test.ts` suite exercises CSRF, redirect normalization, and generic allowed-origin behavior, but it does not verify this route-level env-to-handler wiring for a custom `WORKOS_API_HOSTNAME`.
