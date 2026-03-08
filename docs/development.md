# Development Tooling

This repo uses shared Git hooks through Husky.

## Hook behavior

- `pre-commit` runs `npm run check`, `npm run lint`, and `npm run format:check`
- `pre-push` runs `npm test`

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
`npm run test:ci` is currently an alias for `npm test`.
