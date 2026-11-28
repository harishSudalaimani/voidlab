# Build production dependencies and assemble the prebuilt Backstage backend.
# From the repository root, run: yarn install --immutable, yarn tsc,
# then yarn build:backend before building this image.
# Run this Dockerfile with the repository root as the build context.
FROM node:26-bookworm-slim AS production-deps

ENV PYTHON=/usr/bin/python3

# Native production dependencies such as isolate-vm need a compiler at install
# time. These tools stay in this stage and are not copied into the final image.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends python3 g++ build-essential && \
    rm -rf /var/lib/apt/lists/*

USER node
WORKDIR /app

COPY --chown=node:node .yarn ./.yarn
COPY --chown=node:node .yarnrc.yml ./
COPY --chown=node:node backstage.json ./

ENV NODE_ENV=production
ENV NODE_OPTIONS="--no-node-snapshot"

# Install production dependencies from the workspace skeleton for cache reuse.
COPY --chown=node:node yarn.lock package.json packages/backend/dist/skeleton.tar.gz ./
RUN tar xzf skeleton.tar.gz && rm skeleton.tar.gz

RUN --mount=type=cache,target=/home/node/.cache/yarn,sharing=locked,uid=1000,gid=1000 \
    node .yarn/releases/yarn-4.4.1.cjs workspaces focus --all --production

# The configured scaffolder templates and catalog examples are served at runtime.
COPY --chown=node:node examples ./examples
COPY --chown=node:node packages/backend/dist/bundle.tar.gz app-config*.yaml ./
RUN tar xzf bundle.tar.gz && rm bundle.tar.gz

# Runtime stage contains Node.js, production dependencies, and the assembled app.
FROM node:26-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV NODE_OPTIONS="--no-node-snapshot"

USER node
WORKDIR /app

COPY --from=production-deps --chown=node:node /app/ ./

CMD ["node", "packages/backend", "--config", "app-config.yaml", "--config", "app-config.production.yaml"]
