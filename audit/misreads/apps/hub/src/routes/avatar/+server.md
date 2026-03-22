### Avatar rate limiting can be spoofed because trusted-proxy mode does not enforce SvelteKit client-IP adapter settings

**Location:** `330`

**Reason:** The route does not trust arbitrary client-supplied `x-forwarded-for` values.
`getAvatarRateLimitKey()` delegates to `getTrustedClientAddress()`, which only consults the forwarded chain when the direct peer IP is itself in `TRUSTED_PROXY_IPS`, canonicalizes every hop, rejects malformed chains entirely, and then walks the chain from the right to strip only trusted proxies.
That means the absence of `ADDRESS_HEADER` or `XFF_DEPTH` does not create the spoofable bucket-key path described in the audit, because this route already reconstructs the client address from the trusted proxy allowlist instead of trusting the left-most forwarded hop.
When forwarded data is malformed, the code falls back to the shared empty-key bucket rather than accepting an attacker-chosen client address.

### Avatar proxy double-buffers every successful image body

**Location:** `357`

**Reason:** The audit missed the existing fast path in `joinAvatarChunks()`.
`readAvatarBody()` always collects chunks into `chunks[]`, but `joinAvatarChunks()` returns the original chunk unchanged when the response arrives as a single chunk and only allocates a second `Uint8Array` when there are multiple chunks.
That means the claimed "every successful image body" double-buffering behavior does not actually occur in the current implementation.
