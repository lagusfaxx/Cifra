# ---- base ---------------------------------------------------------------
FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN apk add --no-cache openssl libc6-compat

# ---- deps ---------------------------------------------------------------
FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/crypto/package.json packages/crypto/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm fetch
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile=false --filter @cifra/api... --prefer-offline

# ---- build --------------------------------------------------------------
FROM deps AS build
COPY packages packages
COPY apps/api apps/api
RUN cd /repo/apps/api && pnpm prisma:generate
RUN pnpm --filter @cifra/api build

# ---- runtime ------------------------------------------------------------
FROM node:20-alpine AS runner
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN apk add --no-cache wget openssl libc6-compat tini
RUN addgroup -g 1001 -S cifra && adduser -u 1001 -S cifra -G cifra
WORKDIR /app

COPY --from=build --chown=cifra:cifra /repo/node_modules /app/node_modules
COPY --from=build --chown=cifra:cifra /repo/packages/crypto /app/packages/crypto
COPY --from=build --chown=cifra:cifra /repo/packages/shared /app/packages/shared
COPY --from=build --chown=cifra:cifra /repo/apps/api/node_modules /app/apps/api/node_modules
COPY --from=build --chown=cifra:cifra /repo/apps/api/dist /app/apps/api/dist
COPY --from=build --chown=cifra:cifra /repo/apps/api/prisma /app/apps/api/prisma
COPY --from=build --chown=cifra:cifra /repo/apps/api/package.json /app/apps/api/package.json
COPY --chown=cifra:cifra apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER cifra
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --spider -q http://localhost:4000/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/index.js"]
