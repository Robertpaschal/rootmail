# Build from the repo root (needs the whole workspace):
#   docker build -f apps/dashboard/Dockerfile -t rootmail-dashboard .
# The dashboard calls the API server-side only; all its env is read at runtime
# (no NEXT_PUBLIC_* baked in), so no build args are needed.
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rootmail/dashboard build

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["pnpm", "--filter", "@rootmail/dashboard", "start"]
