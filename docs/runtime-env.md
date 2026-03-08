# Runtime Environment

This document covers the production runtime environment expected by the Kaivalo app.

For a development-oriented starting point, see `apps/hub/.env.example`.

## Required Variables

### WorkOS

- `WORKOS_CLIENT_ID`
  WorkOS AuthKit client identifier.

- `WORKOS_API_KEY`
  WorkOS API key used by the server.

- `WORKOS_REDIRECT_URI`
  Absolute callback URL for WorkOS.
  Must end at `/auth/callback`.
  Must use `https` outside local development.

- `WORKOS_COOKIE_PASSWORD`
  Must be exactly 64 hex characters.
  Generate with `openssl rand -hex 32`.

### Origin

- `ORIGIN`
  Absolute application origin, for example `https://hub.kaivalo.com`.
  Must use `https` outside local development.
  Must match the origin used by `WORKOS_REDIRECT_URI`.

## Proxy / HTTPS Variables

- `TRUST_X_FORWARDED_PROTO`
  Set to `true` only when TLS is terminated by a trusted proxy and forwarded proto headers should be honored.

- `TRUSTED_PROXY_IPS`
  Comma-separated proxy IPs that are allowed to provide `x-forwarded-proto`.
  When the header contains multiple comma-separated values, the app uses the
  left-most original-client protocol.
  Required when `TRUST_X_FORWARDED_PROTO=true`.

## Server Binding Variables

- `HOST`
  Server bind address.
  Typical production value is `0.0.0.0`.

- `PORT`
  Server port.
  Must be an integer between `1` and `65535`.

- `SHUTDOWN_TIMEOUT_MS`
  Optional graceful-shutdown timeout in milliseconds before force exit.
  Must be a whole positive integer when set.

## Production Expectations

For production:

- `ORIGIN` and `WORKOS_REDIRECT_URI` must stay on the same origin
- `WORKOS_REDIRECT_URI` must end in `/auth/callback`
- `TRUST_X_FORWARDED_PROTO=true` requires a correct `TRUSTED_PROXY_IPS` value
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
WORKOS_COOKIE_PASSWORD=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
TRUST_X_FORWARDED_PROTO=true
TRUSTED_PROXY_IPS=203.0.113.10,2001:db8::10
SHUTDOWN_TIMEOUT_MS=30000
```
