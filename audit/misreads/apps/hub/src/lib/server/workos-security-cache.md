### Baseline security headers leave the app without any Content-Security-Policy

**Location:** `410`

**Reason:** `applyBaselineSecurityHeaders()` does not set `Content-Security-Policy`, but the app already configures CSP in `apps/hub/svelte.config.js:14`.
The audit's conclusion that this "leaves the app without a browser-enforced script and resource policy" is therefore incorrect for the current app.
There may still be a narrower question about raw Node-generated responses outside SvelteKit's CSP handling, but that is not the behavior this finding described.

### Framework-served HTTPS responses lose HSTS when trusted proxy forwarding rewrites `getClientAddress()`

**Location:** `134`

**Reason:** The hook helper does compare `event.getClientAddress()` against `TRUSTED_PROXY_IPS`, and the runtime docs say `ADDRESS_HEADER=x-forwarded-for` with `XFF_DEPTH` makes `getClientAddress()` resolve to the real client IP.
But the shipped app does not rely on that hook decision to emit HSTS for production traffic.
`apps/hub/server.ts` starts the custom Node server, and that runtime applies baseline security headers from the raw socket layer via `evaluateSecureRequest()` in `apps/hub/src/lib/server/node-server-request.ts` and `createHubServer()` in `apps/hub/src/lib/server/node-server-runtime.ts`.
That means trusted proxied HTTPS requests still receive HSTS in the deployed server path even when SvelteKit rewrites `getClientAddress()`, so the runtime regression described by the audit does not actually occur.
