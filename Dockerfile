#
# syntax=docker/dockerfile:1.10
FROM node:24.14.0-bookworm-slim@sha256:b4687aef2571c632a1953695ce4d61d6462a7eda471fe6e272eebf0418f276ba AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/hub/package.json apps/hub/package.json
COPY packages/ui packages/ui
COPY scripts/check-node-version.ts scripts/is-executed-directly.ts scripts/

RUN corepack enable
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY apps/hub apps/hub

RUN HUB_BUILD_ALLOW_PLACEHOLDERS=true pnpm --dir apps/hub run build
RUN pnpm --filter @kaivalo/hub deploy --prod /out

FROM node:24.14.0-bookworm-slim@sha256:b4687aef2571c632a1953695ce4d61d6462a7eda471fe6e272eebf0418f276ba AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3100
WORKDIR /app

COPY --from=build --chown=node:node /out/ ./
USER node

EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "const port = process.env.PORT ?? '3100'; fetch('http://127.0.0.1:' + port + '/healthz').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"]

CMD ["node", "server.ts"]
