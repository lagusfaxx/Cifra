import { Router, type Request, type Response } from 'express';
import argon2 from 'argon2';
import { loginInitSchema, loginVerifySchema, refreshTokenSchema } from '@cifra/shared';
import type { LoginInitResponse, LoginVerifyResponse, AuthTokens } from '@cifra/shared';
import { prisma } from '../lib/db.js';
import { hashUsername } from '../lib/hash.js';
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
} from '../lib/jwt.js';
import { rateLimit, clientIp } from '../middleware/rate-limit.js';
import { HttpError } from '../middleware/error.js';
import { checkAuthThrottle, recordAuthAttempt } from '../lib/auth-throttle.js';
import { createChallenge } from '../lib/challenge.js';

export const loginRouter = Router();

loginRouter.post(
  '/auth/login-init',
  rateLimit({ windowSeconds: 60 * 60, max: 30, keyPrefix: 'login-init' }),
  async (req: Request, res: Response): Promise<void> => {
    const input = loginInitSchema.parse(req.body);
    const usernameHash = hashUsername(input.username);
    const ip = clientIp(req);

    const throttle = await checkAuthThrottle(usernameHash, ip);
    if (!throttle.allowed) {
      res.setHeader('Retry-After', String(Math.max(throttle.retryAfterSeconds, 1)));
      throw new HttpError(429, throttle.reason ?? 'Throttled', 'throttled');
    }

    const user = await prisma.user.findUnique({
      where: { usernameHash },
      select: { id: true, pinSalt: true, verifierSalt: true },
    });

    // Para evitar oráculos de existencia, devolvemos parámetros válidos
    // aun si el user no existe. La verificación falla más adelante.
    // Esto le complica la enumeración a un atacante.
    if (!user) {
      const fakeSalt = Buffer.alloc(16, 0).toString('base64');
      const challenge = await createChallenge('LOGIN', null);
      const response: LoginInitResponse = {
        verifierSalt: fakeSalt,
        pinSalt: fakeSalt,
        challenge,
      };
      res.status(200).json(response);
      return;
    }

    const challenge = await createChallenge('LOGIN', user.id);
    const response: LoginInitResponse = {
      verifierSalt: user.verifierSalt,
      pinSalt: user.pinSalt,
      challenge,
    };
    res.status(200).json(response);
  }
);

loginRouter.post(
  '/auth/login-verify',
  rateLimit({ windowSeconds: 10 * 60, max: 20, keyPrefix: 'login-verify' }),
  async (req: Request, res: Response): Promise<void> => {
    const input = loginVerifySchema.parse(req.body);
    const usernameHash = hashUsername(input.username);
    const ip = clientIp(req);

    const throttle = await checkAuthThrottle(usernameHash, ip);
    if (!throttle.allowed) {
      res.setHeader('Retry-After', String(Math.max(throttle.retryAfterSeconds, 1)));
      throw new HttpError(429, throttle.reason ?? 'Throttled', 'throttled');
    }

    const user = await prisma.user.findUnique({
      where: { usernameHash },
      select: {
        id: true,
        pinVerifier: true,
        encPrivBlob: true,
        encPrivNonce: true,
        passkeys: { select: { id: true } },
      },
    });

    if (!user) {
      await recordAuthAttempt(usernameHash, ip, false);
      throw new HttpError(401, 'Invalid credentials', 'invalid_credentials');
    }

    const verifierOk = await argon2.verify(user.pinVerifier, input.pinVerifier).catch(() => false);
    if (!verifierOk) {
      await recordAuthAttempt(usernameHash, ip, false);
      throw new HttpError(401, 'Invalid credentials', 'invalid_credentials');
    }

    await recordAuthAttempt(usernameHash, ip, true);
    await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });

    const { token: accessToken, expiresAt } = signAccessToken(user.id);
    const refreshToken = await issueRefreshToken(user.id);

    const response: LoginVerifyResponse = {
      tokens: { accessToken, refreshToken, expiresAt },
      encPrivBlob: user.encPrivBlob,
      encPrivNonce: user.encPrivNonce,
      hasPasskey: user.passkeys.length > 0,
    };
    res.status(200).json(response);
  }
);

loginRouter.post(
  '/auth/refresh',
  rateLimit({ windowSeconds: 10 * 60, max: 30, keyPrefix: 'refresh' }),
  async (req: Request, res: Response): Promise<void> => {
    const input = refreshTokenSchema.parse(req.body);
    const rotated = await rotateRefreshToken(input.refreshToken);
    if (!rotated) {
      throw new HttpError(401, 'Invalid refresh token', 'invalid_refresh');
    }
    const { token: accessToken, expiresAt } = signAccessToken(rotated.userId);
    const tokens: AuthTokens = {
      accessToken,
      refreshToken: rotated.refreshToken,
      expiresAt,
    };
    res.status(200).json(tokens);
  }
);

loginRouter.post(
  '/auth/logout',
  async (req: Request, res: Response): Promise<void> => {
    const input = refreshTokenSchema.parse(req.body);
    // best effort: revoke this refresh token
    await rotateRefreshToken(input.refreshToken);
    res.status(204).send();
  }
);

/**
 * Hash helper para el verifier antes de guardarlo durante signup/recovery.
 * Lo expongo desde acá para mantener un único punto de uso de argon2.
 */
export async function hashVerifierForStorage(verifierBase64: string): Promise<string> {
  return argon2.hash(verifierBase64, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}
