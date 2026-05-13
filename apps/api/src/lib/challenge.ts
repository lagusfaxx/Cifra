import { randomBytes } from 'node:crypto';
import { prisma } from './db.js';
import type { ChallengePurpose } from '@prisma/client';

const TTL_SECONDS = 5 * 60;

export async function createChallenge(
  purpose: ChallengePurpose,
  userId: string | null
): Promise<string> {
  const challenge = randomBytes(32).toString('base64');
  await prisma.authChallenge.create({
    data: {
      challenge,
      purpose,
      userId,
      expiresAt: new Date(Date.now() + TTL_SECONDS * 1000),
    },
  });
  return challenge;
}

export async function consumeChallenge(
  challenge: string,
  purpose: ChallengePurpose
): Promise<{ userId: string | null } | null> {
  const row = await prisma.authChallenge.findUnique({ where: { challenge } });
  if (!row) return null;
  if (row.consumedAt) return null;
  if (row.expiresAt < new Date()) return null;
  if (row.purpose !== purpose) return null;
  await prisma.authChallenge.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  });
  return { userId: row.userId };
}

export async function pruneExpiredChallenges(): Promise<void> {
  await prisma.authChallenge.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}
