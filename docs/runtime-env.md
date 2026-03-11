# Runtime Environment

This document covers the production runtime environment expected by the Kaivalo app.

For a development-oriented starting point, see `apps/hub/.env.example`.

The image build is designed for placeholder-safe image builds. Use
`HUB_BUILD_ALLOW_PLACEHOLDERS=true npm --prefix apps/hub run build` for local
smoke builds, CI image assembly, and deploy build jobs that should not receive
live auth credentials.

Real WorkOS values are runtime-only secrets. Provide them only to the running
server process or container, not to the build step.

## Required Variables

### WorkOS

- `WORKOS_CLIENT_ID`
  WorkOS AuthKit client identifier.

- `WORKOS_API_KEY`
  WorkOS API key used by the server.

- `WORKOS_API_HOSTNAME`
  Optional custom hostname for the WorkOS Authentication API and hosted AuthKit
  sign-in/sign-out pages.
  Use this only when the current SDK should call a custom hostname instead of
  the default `api.workos.com`.

- `WORKOS_AUTHKIT_HOSTNAME`
  Optional compatibility check for legacy configs.
  If set, it must exactly match `WORKOS_API_HOSTNAME`.
  The current AuthKit SDK still builds hosted sign-in/sign-out URLs from
  `WORKOS_API_HOSTNAME`, so split API/AuthKit hostnames are unsupported here.

- `WORKOS_REDIRECT_URI`
  Absolute callback URL for WorkOS.
  Must end at `/auth/callback`.
  Must use `https` outside local development.

- `WORKOS_COOKIE_PASSWORD`
  Must be exactly 64 hex characters.
  Generate with `openssl rand -hex 32`.

- `AUTH_ERROR_SIGNING_SECRET`
  Must be exactly 64 hex characters.
  Generate with `openssl rand -hex 32`.
  Used only to sign browser-facing auth failure redirect queries.

### Origin

- `ORIGIN`
  Absolute application origin, for example `https://hub.kaivalo.com`.
  Must use `https` outside local development.
  Must match the origin used by `WORKOS_REDIRECT_URI`.

## Proxy / HTTPS Variables

- `TRUST_X_FORWARDED_PROTO`
  Set to `true` only when TLS is terminated by a trusted proxy and forwarded proto headers should be honored.
  Configure that proxy to strip or overwrite inbound `x-forwarded-proto`
  before forwarding requests to the app.

- `TRUSTED_PROXY_IPS`
  Comma-separated proxy IPs that are allowed to provide `x-forwarded-proto`.
  If the header still contains multiple comma-separated values, the app uses the
  proxy-controlled hop nearest the app, which is the right-most value.
  Required when `TRUST_X_FORWARDED_PROTO=true`.

- `ADDRESS_HEADER`
  Set to `x-forwarded-for` for proxied deployments so SvelteKit can derive
  `event.getClientAddress()` from the forwarded client chain instead of the
  innermost proxy's IP address.

- `XFF_DEPTH`
  Set to the number of trusted proxy hops that sit in front of the app when
  `ADDRESS_HEADER=x-forwarded-for`.
  With one trusted reverse proxy directly in front of the app, use `XFF_DEPTH=1`.

## Server Binding Variables

- `HOST`
  Server bind address.
  Typical production value is `0.0.0.0`.

- `PORT`
  Server port.
  Must be an integer between `1` and `65535`.

- `SHUTDOWN_TIMEOUT_MS`
  Optional graceful-shutdown timeout in milliseconds before force exit.
  Must be a whole positive integer between `1` and `2147483647` when set.

## Production Expectations

For production:

- `ORIGIN` and `WORKOS_REDIRECT_URI` must stay on the same origin
- `WORKOS_REDIRECT_URI` must end in `/auth/callback`
- `TRUST_X_FORWARDED_PROTO=true` requires a correct `TRUSTED_PROXY_IPS` value
- proxied deployments should set `ADDRESS_HEADER=x-forwarded-for` and the
  matching `XFF_DEPTH` value so request-level client identity stays accurate
- the deployed app should expose `/healthz` returning plain-text `ok`

## Example Shape

Do not treat these as real values, only as format examples:

```env
PORT=3100
HOST=0.0.0.0
ORIGIN=https://hub.kaivalo.com
WORKOS_REDIRECT_URI=https://hub.kaivalo.com/auth/callback
WORKOS_CLIENT_ID=client_...
WORKOS_API_KEY=sk_...
# WORKOS_API_HOSTNAME=auth.kaivalo.com
# WORKOS_AUTHKIT_HOSTNAME=auth.kaivalo.com
WORKOS_COOKIE_PASSWORD=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
AUTH_ERROR_SIGNING_SECRET=fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210
TRUST_X_FORWARDED_PROTO=true
TRUSTED_PROXY_IPS=203.0.113.10,2001:db8::10
ADDRESS_HEADER=x-forwarded-for
XFF_DEPTH=1
SHUTDOWN_TIMEOUT_MS=30000
```
