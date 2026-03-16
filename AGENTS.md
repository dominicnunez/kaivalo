# Repository Instructions

## Verification Policy

The verification split in this repository is a hard rule and must not be changed unless the user explicitly asks for it.

- `pre-push` must run the fast verification lane only.
- Regular push and pull request CI must run the fast verification lane only.
- Deploy must run the full verification lane before build and deployment continue.

## Lane Definitions

- Fast verification covers static checks and fast tests only.
- Full verification includes the fast lane plus build, production, integration, and dependency audit coverage.

## Change Guardrail

When editing Husky hooks, pnpm scripts, or GitHub workflows, preserve this fast-vs-full split. Do not move the full suite back into `pre-push` or regular CI unless the user explicitly requests that behavior change.
