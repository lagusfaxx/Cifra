import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { getEnv } from './env.js';
import { prisma } from './db.js';
import { hashRefreshToken } from './hash.js';

const env = getEnv();

export interface AccessTokenPayload {
  sub: string;
  type: 'access';
}

export interface RefreshTokenClaims {
  sub: string;
  jti: string;
  type: 'refresh';
}

export function signAccessToken(userId: string): { token: string; expiresAt: number } {
  const expiresIn = env.JWT_ACCESS_TTL_SECONDS;
  const token = jwt.sign({ sub: userId, type: 'access' } satisfies AccessTokenPayload, env.JWT_SECRET, {
    expiresIn,
    algorithm: 'HS256',
  });
  return { token, expiresAt: Date.now() + expiresIn * 1000 };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid token payload');
  }
  const payload = decoded as Partial<AccessTokenPayload>;
  if (payload.type !== 'access' || typeof payload.sub !== 'string') {
    throw new Error('Invalid token type');
  }
  return { sub: payload.sub, type: 'access' };
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  const jti = randomBytes(16).toString('hex');
  const token = jwt.sign(
    { sub: userId, jti, type: 'refresh' } satisfies RefreshTokenClaims,
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_TTL_SECONDS, algorithm: 'HS256' }
  );
  const fullToken = `${token}.${raw}`;
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(fullToken),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1000),
    },
  });
  return fullToken;
}

export async function rotateRefreshToken(
  presented: string
): Promise<{ userId: string; refreshToken: string } | null> {
  const lastDot = presented.lastIndexOf('.');
  if (lastDot < 0) return null;
  const jwtPart = presented.slice(0, lastDot);
  let decoded: RefreshTokenClaims;
  try {
    const raw = jwt.verify(jwtPart, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Partial<RefreshTokenClaims>;
    if (r.type !== 'refresh' || typeof r.sub !== 'string' || typeof r.jti !== 'string') {
      return null;
    }
    decoded = { sub: r.sub, jti: r.jti, type: 'refresh' };
  } catch {
    return null;
  }

  const tokenHash = hashRefreshToken(presented);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!existing || existing.revokedAt || existing.rotatedAt) return null;
  if (existing.userId !== decoded.sub) return null;
  if (existing.expiresAt < new Date()) return null;

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { rotatedAt: new Date() },
  });

  const newToken = await issueRefreshToken(decoded.sub);
  return { userId: decoded.sub, refreshToken: newToken };
}

export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
