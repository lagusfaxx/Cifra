import cron from 'node-cron';
import { prisma } from '../lib/db.js';
import { minio, BUCKET } from '../lib/minio.js';
import { logger } from '../lib/logger.js';
import { pruneOldAuthAttempts } from '../lib/auth-throttle.js';
import { pruneExpiredChallenges } from '../lib/challenge.js';

export function startCleanupJobs(): void {
  // Cada 60s: borrar mensajes expirados o ya leídos+entregados.
  cron.schedule('*/1 * * * *', async () => {
    try {
      const expired = await prisma.message.findMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { AND: [{ deliveredAt: { not: null } }, { readAt: { not: null } }] },
          ],
        },
        select: { id: true, attachment: { select: { storageKey: true } } },
      });

      if (expired.length === 0) return;

      const keys = expired
        .map((m) => m.attachment?.storageKey)
        .filter((k): k is string => Boolean(k));

      if (keys.length > 0) {
        await Promise.allSettled(keys.map((k) => minio.removeObject(BUCKET, k)));
      }

      await prisma.message.deleteMany({ where: { id: { in: expired.map((m) => m.id) } } });
      logger.info({ count: expired.length }, 'cleaned up messages');
    } catch (err) {
      logger.error({ err }, 'cleanup-messages job failed');
    }
  });

  // Cada 5min: borrar invites y challenges expirados, pending signups,
  // refresh tokens revocados o expirados, attempts viejos.
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();
      const results = await prisma.$transaction([
        prisma.inviteLink.deleteMany({ where: { expiresAt: { lt: now } } }),
        prisma.pendingSignup.deleteMany({ where: { expiresAt: { lt: now } } }),
        prisma.refreshToken.deleteMany({
          where: {
            OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }],
          },
        }),
      ]);
      await pruneExpiredChallenges();
      await pruneOldAuthAttempts();
      logger.info(
        {
          invites: results[0].count,
          signups: results[1].count,
          refresh: results[2].count,
        },
        'cleaned up ancillary records'
      );
    } catch (err) {
      logger.error({ err }, 'cleanup-ancillary job failed');
    }
  });

  // Cada hora: orphan attachments en MinIO (defensa en profundidad).
  cron.schedule('0 * * * *', async () => {
    try {
      const expired = await prisma.attachment.findMany({
        where: { expiresAt: { lt: new Date() } },
        select: { id: true, storageKey: true },
      });
      if (expired.length === 0) return;
      await Promise.allSettled(expired.map((a) => minio.removeObject(BUCKET, a.storageKey)));
      await prisma.attachment.deleteMany({ where: { id: { in: expired.map((a) => a.id) } } });
      logger.info({ count: expired.length }, 'cleaned up orphan attachments');
    } catch (err) {
      logger.error({ err }, 'cleanup-attachments job failed');
    }
  });
}
