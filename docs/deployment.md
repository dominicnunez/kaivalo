# Deployment

This repo owns the application side of deployment.

It owns:

- the container image build
- the GitHub Actions deployment workflow
- the app health endpoint
- the runtime environment contract for the running app

It does not own:

- VPS bootstrap
- reverse proxy setup
- host SSH policy
- server-side deploy helper implementation

Those host and infrastructure details intentionally live in a private infra repo.

## Workflow

Repository verification runs in `.github/workflows/ci.yml` on `push` and
`pull_request`.

Production deployment remains in `.github/workflows/deploy.yml`.

At a high level the two workflows do this:

- CI runs linting plus the fast verification lane on every push and pull request
- deploy builds and pushes the production image to GHCR
- deploy runs the full verification lane before build and deployment continue
- deploy targets the `production` GitHub Environment
- deploy calls the host-side deploy contract with `deploy-app kaivalo <image@sha256:...>`

The scheduled full-suite workflow also runs the full verification lane outside
the push and pull request path.

## GitHub Environment

Create a `production` GitHub Environment in this repo and add:

- `DEPLOY_HOST`
- `DEPLOY_PORT`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_KNOWN_HOSTS`
- variable `DEPLOY_ORIGIN`

These values are only for the CI-to-host deployment path.
`DEPLOY_ORIGIN` should be the public app origin, for example `https://hub.kaivalo.com`,
so the workflow can verify `/` and `/healthz` after the host deploy command returns.

Recommended:

- require reviewers for the `production` environment
- restrict production deployment to `main` and/or release tags

## Runtime Environment

The running app expects its runtime environment to be present on the server before deployment.

See `docs/runtime-env.md` for the required variables and constraints.

This repo does not document private server-local file locations; that belongs to the private infra docs.

## Triggering A Deploy

The current workflows support:

- automatic CI on `push`
- automatic CI on `pull_request`
- manual deploy dispatch from GitHub Actions

Deploy stays manual so production release approval remains separate from routine repository verification.

When triggered successfully, the workflow should:

1. pass CI
2. publish an image
3. deploy that image digest to production

## Post-Deploy Verification

After a deployment, verify:

- the workflow completed successfully
- the landing page loads
- `/healthz` returns `200` with plain-text `ok`
- the auth callback route is reachable at `/auth/callback`

## Failure Handling

If deployment fails, use this split:

App repo responsibilities:

- investigate workflow failures
- investigate test failures
- investigate image build failures
- investigate application behavior regressions

Infra repo responsibilities:

- VPS bootstrap and host readiness
- reverse proxy and host routing
- host-side deploy and rollback primitives
- SSH/deploy access policy

This split is intentional so the public app repo does not carry private infrastructure detail.
