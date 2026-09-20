# Build from the repo root (needs the whole workspace):
#   docker build -f apps/dashboard/Dockerfile -t rootmail-dashboard .
# The dashboard calls the API server-side only; all its env is read at runtime
# (no NEXT_PUBLIC_* baked in), so no build args are needed.
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Cache dependencies independently of source; never restore partial .next output.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --frozen-lockfile

COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter @rootmail/dashboard build && mkdir -p apps/dashboard/public

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/apps/dashboard/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=build --chown=node:node /app/apps/dashboard/public ./apps/dashboard/public
USER node
EXPOSE 3000
CMD ["node", "apps/dashboard/server.js"]
