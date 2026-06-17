# Build from the repo root (needs the whole workspace):
#   docker build -f apps/api/Dockerfile -t rootmail-api .
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
WORKDIR /app

# Internal packages export TS source and run via tsx (no build step), so we ship
# the source + install deps. (Optimize later with a pruned multi-stage build.)
COPY . .
RUN pnpm install --frozen-lockfile

ENV API_HOST=0.0.0.0
EXPOSE 4000
# Health: GET /health
CMD ["pnpm", "--filter", "@rootmail/api", "exec", "tsx", "src/index.ts"]
