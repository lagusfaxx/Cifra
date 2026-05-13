# ---- base ---------------------------------------------------------------
FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN apk add --no-cache libc6-compat

# ---- deps ---------------------------------------------------------------
FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/crypto/package.json packages/crypto/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm fetch
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile=false --filter @cifra/web... --prefer-offline

# ---- build --------------------------------------------------------------
FROM deps AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY packages packages
COPY apps/web apps/web
RUN pnpm --filter @cifra/web build

# ---- runtime ------------------------------------------------------------
FROM node:20-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3000
RUN apk add --no-cache wget tini
RUN addgroup -g 1001 -S cifra && adduser -u 1001 -S cifra -G cifra
WORKDIR /app

COPY --from=build --chown=cifra:cifra /repo/apps/web/.next/standalone /app/
COPY --from=build --chown=cifra:cifra /repo/apps/web/.next/static /app/apps/web/.next/static
COPY --from=build --chown=cifra:cifra /repo/apps/web/public /app/apps/web/public

USER cifra
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --spider -q http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
