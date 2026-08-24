# syntax=docker/dockerfile:1.7
#
# Build context is the REPO ROOT, not apps/api: the pnpm lockfile lives at the workspace
# root, and the runtime stage bakes in skills/ so the console drives *this repo's*
# controller instead of whatever happens to be installed on the host.
#
#   docker build -f apps/api/Dockerfile -t aidlc-console-api .

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# --------------------------------------------------------------------- manifests
# Manifests alone, so editing a .ts file does not invalidate the dependency layer.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

FROM manifests AS deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @aidlc-console/api

FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @aidlc-console/api

# --------------------------------------------------------------------- build
FROM deps AS build
COPY apps/api apps/api
RUN pnpm --filter @aidlc-console/api build

# --------------------------------------------------------------------- runtime
FROM node:22-alpine AS runtime

# python3 runs the controller and git backs the repository inspector. Neither is a
# convenience: without python3 the API boots, logs "controller unavailable", and every
# gate and ticket action fails while reads keep working — the confusing half-broken state
# the bootstrap probe exists to shout about.
RUN apk add --no-cache python3 git tini

ENV NODE_ENV=production \
    AIDLC_CORE_PATH=/opt/aidlc/skills/ai-dlc-core \
    AIDLC_VERIFY_PATH=/opt/aidlc/skills/ai-dlc-verify \
    AIDLC_PYTHON=python3 \
    AIDLC_CONSOLE_HOME=/var/lib/aidlc-console \
    AIDLC_SKILL_SOURCES=/opt/aidlc/skills,/opt/aidlc/examples \
    PORT=7777 \
    HOST=0.0.0.0

WORKDIR /repo

# pnpm links each package's node_modules into <root>/node_modules/.pnpm by *relative*
# path, so both trees have to land at the same depth they had at install time. Copying
# them to anywhere but /repo and /repo/apps/api resolves every import to nothing.
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY apps/api/package.json ./apps/api/package.json

# The controller this console shells out to, pinned to the image — and the example
# profile, which the Skills page offers as a project-scoped install.
COPY skills /opt/aidlc/skills
COPY examples /opt/aidlc/examples

RUN mkdir -p /var/lib/aidlc-console

# HOST=0.0.0.0 above is the container's own interfaces, not the host's. Isolation here is
# the network namespace plus the publish mapping (compose binds 127.0.0.1 by default), so
# binding loopback *inside* the container would only make the API unreachable from nginx
# and from the port mapping — which is exactly what happened once.
WORKDIR /repo/apps/api
EXPOSE 7777

# tini reaps the controller subprocesses; without it a cancelled agent run leaves zombies
# and `enableShutdownHooks` never sees SIGTERM.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
