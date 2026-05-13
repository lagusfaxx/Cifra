import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { redis } from '../lib/redis.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'cifra-api' });
});

healthRouter.get('/health/deep', async (_req, res) => {
  const checks: Record<string, boolean> = { db: false, redis: false };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = true;
  } catch {
    checks.db = false;
  }
  try {
    const pong = await redis.ping();
    checks.redis = pong === 'PONG';
  } catch {
    checks.redis = false;
  }
  const ok = checks.db && checks.redis;
  res.status(ok ? 200 : 503).json({ ok, checks });
});
