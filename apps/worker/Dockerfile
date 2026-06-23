# Build from the repo root (needs the whole workspace):
#   docker build -f apps/worker/Dockerfile -t rootmail-worker .
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile

# Background processor (BullMQ). No port; needs DATABASE_URL + REDIS_URL.
CMD ["pnpm", "--filter", "@rootmail/worker", "exec", "tsx", "src/index.ts"]
