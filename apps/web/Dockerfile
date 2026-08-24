# syntax=docker/dockerfile:1.7
#
# Build context is the REPO ROOT (the pnpm lockfile lives there). Two useful targets:
#
#   --target runtime   nginx serving the built SPA and proxying the API   (default)
#   --target dev       vite dev server with HMR, source bind-mounted by compose

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

FROM manifests AS deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @aidlc-console/web

# --------------------------------------------------------------------- dev
# Source arrives as a bind mount from compose, with an anonymous volume shadowing
# node_modules so the host's (absent) copy never hides the installed one.
FROM deps AS dev
WORKDIR /repo/apps/web
EXPOSE 5173
CMD ["pnpm", "dev", "--host", "0.0.0.0"]

# --------------------------------------------------------------------- build
FROM deps AS build
COPY apps/web apps/web
RUN pnpm --filter @aidlc-console/web build

# --------------------------------------------------------------------- runtime
FROM nginx:alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
