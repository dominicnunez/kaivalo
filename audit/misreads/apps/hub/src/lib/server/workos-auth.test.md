### Real WorkOS sign-out handling only exercises the happy path

**Location:** `85`

**Reason:** The audit missed existing failure-path coverage for the configured WorkOS sign-out flow.
`tests/hub-preview-script.test.ts:480` starts the real preview app, signs in through the callback route, then exercises `/auth/sign-out` while `tests/helpers/hub-preview-fixtures.mts:212` patches `AuthService.prototype.signOut` to throw.
That path goes through the actual configured sign-out handler and already asserts the sanitized `503` response and that no cookies are leaked on failure.
A narrower gap around malformed logout response contracts may still exist, but the report's claim that real sign-out handling only covers the happy path is factually wrong.
