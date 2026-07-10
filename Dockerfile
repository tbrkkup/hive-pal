# syntax=docker/dockerfile:1
# Stage 1: Base
FROM node:22-alpine AS base
RUN corepack enable
RUN npm i -g turbo
WORKDIR /app

# Stage 2: Prune monorepo
FROM base AS pruner
COPY . .
RUN turbo prune --scope=backend --scope=frontend --docker

# Stage 3: Build
FROM base AS builder

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
# Cache the pnpm content-addressable store across builds so dependency installs
# are fast even when the lockfile changes.
RUN --mount=type=cache,id=hivepal-pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir=/pnpm-store

COPY --from=pruner /app/out/full/ .
COPY turbo.json turbo.json

RUN pnpm --filter backend exec prisma generate
# Persist turbo's build cache across builds. On a code change this turns
# unchanged packages (e.g. the frontend when only the backend changed) into
# cache hits instead of full rebuilds — the main speed-up for iterative deploys.
RUN --mount=type=cache,id=hivepal-turbo,target=/app/.turbo \
    turbo run build --filter=frontend... --filter=backend... --cache-dir=/app/.turbo

# Stage 4: Production
FROM node:22-alpine AS production
RUN apk add --no-cache netcat-openbsd
WORKDIR /app

COPY --from=builder /app/ /app/

# Copy frontend build output into backend's static directory
RUN cp -r /app/apps/frontend/dist /app/apps/backend/dist/static

RUN mkdir -p /data/uploads

COPY apps/backend/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "apps/backend/dist/src/main.js"]
