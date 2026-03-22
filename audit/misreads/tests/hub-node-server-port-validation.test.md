### Startup tests never exercise asynchronous bind failures like EADDRINUSE

**Location:** `49`

**Reason:** The claim says the current test suite never exercises asynchronous `server.listen()` failures.
That is incorrect: `tests/hub-node-server.test.ts:870` already reserves a local port, calls `startHubServer()` with that occupied port, waits for the fatal event, and asserts the controlled startup-failure path.
The narrower `tests/hub-node-server-port-validation.test.ts` file does focus on synchronous validation failures, but the audit described a suite-wide coverage gap that does not exist.
