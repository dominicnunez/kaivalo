# Development Tooling

This repo uses shared Git hooks through Husky.

## Hook behavior

- `pre-commit` runs `npm run check`, `npm run lint`, and `npm run format:check`
- `pre-push` runs `npm run test:fast`

The commit hook validates formatting but does not rewrite files for you. If formatting fails, run `npm run format` and recommit.

## Setup

Use the Nix shell if you want a self-contained environment:

```bash
nix develop
npm install
```

`npm install` runs the repo `prepare` script, which installs the Husky hooks for your local checkout.

## Common commands

```bash
npm run check
npm run audit:deps
npm run lint
npm run format
npm run format:check
npm run test:core
npm test
npm run test:integration
npm run test:ci
```

`npm run test:core` is the faster local lane: app type checks, app Vitest coverage, and the pure Node-side test files.
`npm test` runs the full verification flow: core, build, production, and integration coverage.
`npm run test:integration` runs the slower preview-backed integration coverage after the app is built.
`npm run audit:deps` runs `npm audit --json` through the repo allowlist so accepted upstream-only advisories stay documented and new ones fail fast across the full lockfile.
`npm run test:fast` is the fast verification lane used by `pre-push` and regular CI.
`npm run test:ci` runs the same fast verification lane for GitHub Actions push and pull request checks.
`npm run test:deploy` runs the full verification lane, including the dependency audit gate, before deployment continues.
`npm --prefix apps/hub run preview` starts the built Node adapter entrypoint, not Vite's static preview server. If runtime auth secrets are absent locally, it fills only the missing auth env with loopback-safe placeholder values so the built app can still be exercised end to end.
