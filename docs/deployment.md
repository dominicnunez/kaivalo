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

The deployment workflow is defined in `.github/workflows/deploy.yml`.

At a high level it:

- runs the test suite
- builds and pushes the production image to GHCR
- deploys to the `production` GitHub Environment
- calls the host-side deploy contract with `deploy-app kaivalo <image@sha256:...>`

## GitHub Environment

Create a `production` GitHub Environment in this repo and add:

- `DEPLOY_HOST`
- `DEPLOY_PORT`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_KNOWN_HOSTS`

These values are only for the CI-to-host deployment path.

Recommended:

- require reviewers for the `production` environment
- restrict production deployment to `main` and/or release tags

## Runtime Environment

The running app expects its runtime environment to be present on the server before deployment.

See `docs/runtime-env.md` for the required variables and constraints.

This repo does not document private server-local file locations; that belongs to the private infra docs.

## Triggering A Deploy

The current workflow supports:

- manual dispatch from GitHub Actions

### Making Deploys Automatic

If you want automatic deploys from this repo, update the `on:` block in `.github/workflows/deploy.yml` to include the branch or tags you want to release from.

Typical example:

```yaml
on:
  push:
    branches:
      - main
  workflow_dispatch:
```

You can also add tag-based deploys, for example:

```yaml
on:
  push:
    branches:
      - main
    tags:
      - 'v*'
  workflow_dispatch:
```

Recommended:

- use the `production` GitHub Environment so deploy secrets stay gated
- restrict automatic production deploys to reviewed branches or release tags
- keep required reviewers enabled if you want human approval before production deploys

When triggered successfully, the workflow should:

1. pass tests
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
