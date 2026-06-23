# Build from the repo root (needs the whole workspace):
#   docker build -f apps/admin/Dockerfile -t rootmail-admin .
# Internal staff console — calls the API server-side only; env read at runtime.
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rootmail/admin build

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["pnpm", "--filter", "@rootmail/admin", "start"]
