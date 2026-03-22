### Loopback-IP HTTP auth flows can never persist the WorkOS cookies

**Location:** `240`

**Reason:** The audit's browser-behavior claim is wrong.
Direct validation with headless Chromium 145.0.7632.116 showed both the `__Secure-wos_callback_state` cookie and the `__Host-wos_session` cookie were accepted and sent back over plain `http://127.0.0.1` and `http://[::1]`.
The repo's allowed loopback-IP auth flows therefore do not "can never persist" these cookies in the current browser runtime.
