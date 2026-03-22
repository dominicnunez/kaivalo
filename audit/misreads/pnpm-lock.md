### Vulnerable production cookie dependency is still shipped through @sveltejs/kit

**Location:** `N/A`

**Reason:** The lockfile does resolve `cookie` through `@sveltejs/kit`, but this item is already an upstream-only exception rather than a repo-controlled defect.
The current `@sveltejs/kit` release in the workspace still declares `cookie@^0.6.0`, and the report itself notes that no direct fix is available.
Because there is no durable in-repo remediation path today beyond waiting for the upstream dependency update, keeping this in `audit/report.md` misclassifies an accepted upstream constraint as an active repository finding.
