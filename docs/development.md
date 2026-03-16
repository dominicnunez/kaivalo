# Development Tooling

This repo uses shared Git hooks through Husky.

## Hook behavior

- `pre-commit` runs `pnpm run check`, `pnpm run lint`, and `pnpm run format:check`
- `pre-push` runs `pnpm run test:fast`

The commit hook validates formatting but does not rewrite files for you. If formatting fails, run `pnpm run format` and recommit.

## Setup

Use the Nix shell if you want a self-contained environment:

```bash
nix develop
pnpm install
```

`pnpm install` runs the repo `prepare` script, which installs the Husky hooks for your local checkout.

## Common commands

```bash
pnpm run check
pnpm run audit:deps
pnpm run lint
pnpm run format
pnpm run format:check
pnpm run test:core
pnpm test
pnpm run test:integration
pnpm run test:ci
```

`pnpm run test:core` is the faster local lane: app type checks, app Vitest coverage, and the pure Node-side test files.
`pnpm test` runs the full verification flow: core, build, production, and integration coverage.
`pnpm run test:integration` runs the slower preview-backed integration coverage after the app is built.
`pnpm run audit:deps` runs `pnpm audit --json` through the repo allowlist so accepted upstream-only production advisories stay documented and new ones fail fast across the full lockfile.
`pnpm run test:fast` is the fast verification lane used by `pre-push` and regular CI.
`pnpm run test:ci` runs the same fast verification lane for GitHub Actions push and pull request checks.
`pnpm run test:deploy` runs the full verification lane, including the dependency audit gate, before deployment continues.
`pnpm --dir apps/hub run preview` starts the built Node adapter entrypoint, not Vite's static preview server. If runtime auth secrets are absent locally, it fills only the missing auth env with loopback-safe placeholder values so the built app can still be exercised end to end.
