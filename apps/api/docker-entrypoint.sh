#!/bin/sh
set -e

echo "[entrypoint] running prisma migrate deploy"
cd /app/apps/api && npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "[entrypoint] starting api"
cd /app && exec "$@"
