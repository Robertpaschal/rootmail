# Build from the repo root (needs the whole workspace):
#   docker build -f apps/developers/Dockerfile -t rootmail-developers .
# NEXT_PUBLIC_* are baked into the client bundle at build time, so they're build args.
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Cache dependencies independently of source; never restore partial .next output.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --frozen-lockfile

COPY . .
RUN pnpm install --offline --frozen-lockfile

ARG NEXT_PUBLIC_DASHBOARD_URL=https://app.rootmail.io
ENV NEXT_PUBLIC_DASHBOARD_URL=$NEXT_PUBLIC_DASHBOARD_URL
RUN pnpm --filter @rootmail/developers build && mkdir -p apps/developers/public

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/apps/developers/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/developers/.next/static ./apps/developers/.next/static
COPY --from=build --chown=node:node /app/apps/developers/public ./apps/developers/public
USER node
EXPOSE 3000
CMD ["node", "apps/developers/server.js"]
