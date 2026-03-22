### Avatar responses are fully validated in a bounded buffer before the proxy sends bytes

**Location:** `42`

**Reason:** The proxy intentionally validates the full upstream body against
`AVATAR_MAX_RESPONSE_BYTES` before returning a `200` response so oversized
chunked responses become a deterministic `502` instead of a partial image with
an already-committed success status. The implementation now uses a single
bounded 1 MB buffer while assembling the response body, so the remaining lack
of early streaming is a deliberate correctness tradeoff.
