FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/hub/package.json apps/hub/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN npm ci

COPY apps/hub apps/hub
COPY packages/ui packages/ui

RUN WORKOS_CLIENT_ID=client_build_placeholder \
    WORKOS_API_KEY=sk_build_placeholder \
    WORKOS_REDIRECT_URI=http://localhost:3100/auth/callback \
    WORKOS_COOKIE_PASSWORD=abababababababababababababababababababababababababababababababab \
    ORIGIN=http://localhost:3100 \
    npm --prefix apps/hub run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3100
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/ui ./packages/ui
COPY --from=build --chown=node:node /app/apps/hub ./apps/hub

WORKDIR /app/apps/hub
USER node

EXPOSE 3100

CMD ["node", "server.js"]
