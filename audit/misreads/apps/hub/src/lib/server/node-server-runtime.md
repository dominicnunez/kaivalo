### Startup path contains a dead HOST assignment

**Location:** `571`

**Reason:** The audit called `host = env.HOST.trim()` dead because the next line assigns `host = parseHost(env.HOST)`.
That misses the surrounding `try`/`catch`: if `parseHost(env.HOST)` throws, control jumps to `handleStartupError(error)` before the second assignment completes.
In that failure path, `handleStartupError()` logs and reports the current `host` value, so the trim step preserves the caller-supplied HOST for fatal diagnostics instead of falling back to the default `127.0.0.1`.
The assignment may be debatable style, but it is not dead code and the behavior described by the audit does not match the actual control flow.
