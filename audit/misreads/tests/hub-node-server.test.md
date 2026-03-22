### Node-server test still documents a removed debug env toggle

**Location:** `244`

**Reason:** The audit misread the test’s intent.
The runtime no longer reads `KAIVALO_INCLUDE_SENSITIVE_ERROR_LOGS`, and the test explicitly verifies that setting the legacy variable does not disable production redaction.
That is not stale documentation for a live runtime switch; it is a regression test confirming the legacy toggle is ignored.
