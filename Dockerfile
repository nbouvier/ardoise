# syntax=docker/dockerfile:1

# SplitCount API server (apps/server). Build from the repository root:
#
#   docker build -t ardoise-server .
#
# The CI builds it for linux/amd64 and linux/arm64 (a multi-platform image: each
# machine pulls its own architecture).
#
# The same image runs the server and the migration release step
# (`node apps/server/dist/scripts/migrate.js`); see docs/DEPLOYMENT.md.

# Keep in step with .nvmrc.
ARG NODE_VERSION=26

# --- Production dependencies only ---------------------------------------------
# Manifests first: the install is cached until a dependency changes. The mobile
# manifest is copied too, only because the lockfile covers every workspace.
FROM node:${NODE_VERSION}-slim AS prod-deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
# --ignore-scripts: @splitcount/shared builds itself in `prepare`, but its sources
# are not here yet (and it is built once, below).
RUN npm ci --omit=dev --ignore-scripts \
    --workspace @splitcount/server --workspace @splitcount/shared

# --- Build ---------------------------------------------------------------------
# Runs on the builder's own platform whatever the target: its output (JavaScript)
# is the same for every architecture, and compiling under emulation is slow. The
# dependencies above and the runtime below stay on the target platform, so a
# package with a native binary still gets the right one.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
RUN npm ci --ignore-scripts \
    --workspace @splitcount/server --workspace @splitcount/shared
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
# shared first, then the server that imports it (the root `build` script).
RUN npm run build

# --- Runtime -------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Same layout as in the repo: node_modules links @splitcount/shared to
# ../../packages/shared, and the server finds its migrations at apps/server/drizzle.
COPY --from=prod-deps /repo/node_modules node_modules
COPY --from=build /repo/package.json ./
COPY --from=build /repo/packages/shared/package.json packages/shared/
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/server/package.json apps/server/
COPY --from=build /repo/apps/server/dist apps/server/dist
COPY apps/server/drizzle apps/server/drizzle

# Not root: the `node` user ships with the base image.
USER node
EXPOSE 3000

# `/health` answers 503 while the server drains (docs/DEPLOYMENT.md). The
# start period covers the boot, not a slow database: a failed start exits.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "require('node:http').get('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]

CMD ["node", "apps/server/dist/index.js"]
