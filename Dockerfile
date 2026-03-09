#
# syntax=docker/dockerfile:1.10
FROM node:24.14.0-bookworm-slim@sha256:b4687aef2571c632a1953695ce4d61d6462a7eda471fe6e272eebf0418f276ba AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/hub/package.json apps/hub/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN npm ci --ignore-scripts

COPY apps/hub apps/hub
COPY packages/ui packages/ui

RUN --mount=type=secret,id=workos_client_id,env=WORKOS_CLIENT_ID,required=true \
    --mount=type=secret,id=workos_api_key,env=WORKOS_API_KEY,required=true \
    --mount=type=secret,id=workos_redirect_uri,env=WORKOS_REDIRECT_URI,required=true \
    --mount=type=secret,id=workos_cookie_password,env=WORKOS_COOKIE_PASSWORD,required=true \
    --mount=type=secret,id=auth_error_signing_secret,env=AUTH_ERROR_SIGNING_SECRET,required=true \
    --mount=type=secret,id=origin,env=ORIGIN,required=true \
    npm --prefix apps/hub run build
RUN npm prune --omit=dev

FROM node:24.14.0-bookworm-slim@sha256:b4687aef2571c632a1953695ce4d61d6462a7eda471fe6e272eebf0418f276ba AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3100
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/hub/package.json ./apps/hub/package.json
COPY --from=build --chown=node:node /app/apps/hub/server.ts ./apps/hub/server.ts
COPY --from=build --chown=node:node /app/apps/hub/build ./apps/hub/build

WORKDIR /app/apps/hub
USER node

EXPOSE 3100

CMD ["node", "server.ts"]
