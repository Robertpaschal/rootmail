# Build from the repo root (needs the whole workspace):
#   docker build -f apps/admin/Dockerfile -t rootmail-admin .
# Internal staff console — calls the API server-side only; env read at runtime.
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Cache dependencies independently of source; never restore partial .next output.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --frozen-lockfile

COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter @rootmail/admin build && mkdir -p apps/admin/public

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/apps/admin/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build --chown=node:node /app/apps/admin/public ./apps/admin/public
USER node
EXPOSE 3000
CMD ["node", "apps/admin/server.js"]
