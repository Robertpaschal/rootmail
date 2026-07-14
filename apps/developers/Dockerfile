# Build from the repo root (needs the whole workspace):
#   docker build -f apps/developers/Dockerfile -t rootmail-developers .
# NEXT_PUBLIC_* are baked into the client bundle at build time, so they're build args.
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_DASHBOARD_URL
ENV NEXT_PUBLIC_DASHBOARD_URL=$NEXT_PUBLIC_DASHBOARD_URL
RUN pnpm --filter @rootmail/developers build

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["pnpm", "--filter", "@rootmail/developers", "start"]
