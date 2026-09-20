# Keep workspace paths: core/db execute TypeScript and migrations need SQL.
FROM node:22-alpine AS dependencies
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
RUN pnpm install --prod --frozen-lockfile
COPY apps/api/src apps/api/src
COPY packages/core/src packages/core/src
COPY packages/db/src packages/db/src
COPY packages/db/migrations packages/db/migrations

FROM node:22-alpine AS runtime
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
WORKDIR /app
COPY --from=dependencies --chown=node:node /app ./
ENV NODE_ENV=production API_HOST=0.0.0.0 COREPACK_ENABLE_NETWORK=0
USER node
EXPOSE 4000
CMD ["pnpm", "--filter", "@rootmail/api", "start"]
