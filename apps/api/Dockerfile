FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/mcp/package.json apps/mcp/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @myhr/db generate
RUN pnpm --filter @myhr/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
CMD ["node", "apps/api/dist/index.js"]
