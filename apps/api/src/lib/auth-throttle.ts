import { prisma } from './db.js';
import { hashIp } from './hash.js';
import { logger } from './logger.js';

const WINDOWS = [
  { seconds: 10 * 60, max: 4, lockSeconds: 15 * 60, label: '4 in 10min' },
  { seconds: 60 * 60, max: 10, lockSeconds: 24 * 60 * 60, label: '10 in 1h' },
  { seconds: 24 * 60 * 60, max: 20, lockSeconds: 0, label: '20 in 24h' },
] as const;

export interface ThrottleResult {
  allowed: boolean;
  retryAfterSeconds: number;
  reason?: string;
}

export async function checkAuthThrottle(usernameHash: string, ip: string): Promise<ThrottleResult> {
  const ipHash = hashIp(ip);
  const now = Date.now();

  for (const w of WINDOWS) {
    const since = new Date(now - w.seconds * 1000);

    const byUser = await prisma.authAttempt.count({
      where: { usernameHash, success: false, createdAt: { gte: since } },
    });
    const byIp = await prisma.authAttempt.count({
      where: { ipHash, success: false, createdAt: { gte: since } },
    });

    const offender = Math.max(byUser, byIp);
    if (offender >= w.max) {
      if (w.lockSeconds === 0) {
        return {
          allowed: false,
          retryAfterSeconds: -1,
          reason: 'account_locked_recovery_required',
        };
      }
      const latest = await prisma.authAttempt.findFirst({
        where: {
          OR: [{ usernameHash }, { ipHash }],
          success: false,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
      });
      const lockedUntil =
        (latest?.createdAt.getTime() ?? now) + w.lockSeconds * 1000;
      if (lockedUntil > now) {
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil((lockedUntil - now) / 1000),
          reason: `throttled_${w.label.replace(/\s+/g, '_')}`,
        };
      }
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export async function recordAuthAttempt(
  usernameHash: string,
  ip: string,
  success: boolean
): Promise<void> {
  await prisma.authAttempt.create({
    data: { usernameHash, ipHash: hashIp(ip), success },
  });
  if (!success) {
    logger.info({ event: 'auth_attempt_failed' }, 'auth failure recorded');
  }
}

export async function pruneOldAuthAttempts(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await prisma.authAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } });
}
