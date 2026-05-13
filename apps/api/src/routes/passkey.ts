import { Router, type Request, type Response } from 'express';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { z } from 'zod';
import {
  passkeyRegisterFinishSchema,
  passkeyAuthStartSchema,
  passkeyAuthFinishSchema,
} from '@cifra/shared';
import { prisma } from '../lib/db.js';
import { hashUsername } from '../lib/hash.js';
import { getEnv } from '../lib/env.js';
import { redis } from '../lib/redis.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit, clientIp } from '../middleware/rate-limit.js';
import { HttpError } from '../middleware/error.js';
import { checkAuthThrottle, recordAuthAttempt } from '../lib/auth-throttle.js';
import { signAccessToken, issueRefreshToken } from '../lib/jwt.js';

export const passkeyRouter = Router();
const env = getEnv();

const CHALLENGE_TTL = 5 * 60;

function regChallengeKey(userId: string): string {
  return `passkey:reg:${userId}`;
}
function authChallengeKey(usernameHash: string): string {
  return `passkey:auth:${usernameHash}`;
}

passkeyRouter.post(
  '/auth/passkey/register/start',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, usernameHash: true, displayName: true, passkeys: true },
    });
    if (!user) throw new HttpError(404, 'User not found', 'not_found');

    const options = await generateRegistrationOptions({
      rpName: env.RP_NAME,
      rpID: env.RP_ID,
      userID: Buffer.from(user.id),
      userName: user.usernameHash,
      userDisplayName: user.displayName,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      excludeCredentials: user.passkeys.map((p) => ({
        id: p.credentialId,
        transports: p.transports ? (p.transports.split(',') as ('usb' | 'ble' | 'nfc' | 'internal' | 'hybrid')[]) : undefined,
      })),
    });

    await redis.set(regChallengeKey(user.id), options.challenge, 'EX', CHALLENGE_TTL);
    res.status(200).json(options);
  }
);

passkeyRouter.post(
  '/auth/passkey/register/finish',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const input = passkeyRegisterFinishSchema.parse(req.body);
    const userId = req.userId!;

    const expectedChallenge = await redis.get(regChallengeKey(userId));
    if (!expectedChallenge) throw new HttpError(400, 'No active challenge', 'no_challenge');

    const verification = await verifyRegistrationResponse({
      response: input.attestationResponse as RegistrationResponseJSON,
      expectedChallenge,
      expectedOrigin: env.RP_ORIGIN,
      expectedRPID: env.RP_ID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new HttpError(400, 'Verification failed', 'verification_failed');
    }

    const { credential } = verification.registrationInfo;
    await prisma.passkey.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: credential.transports?.join(',') ?? null,
        deviceName: input.deviceName ?? null,
      },
    });
    await redis.del(regChallengeKey(userId));

    res.status(201).json({ ok: true });
  }
);

passkeyRouter.post(
  '/auth/passkey/auth/start',
  rateLimit({ windowSeconds: 10 * 60, max: 20, keyPrefix: 'passkey-auth-start' }),
  async (req: Request, res: Response): Promise<void> => {
    const input = passkeyAuthStartSchema.parse(req.body);
    const usernameHash = hashUsername(input.username);
    const ip = clientIp(req);

    const throttle = await checkAuthThrottle(usernameHash, ip);
    if (!throttle.allowed) {
      res.setHeader('Retry-After', String(Math.max(throttle.retryAfterSeconds, 1)));
      throw new HttpError(429, 'Throttled', 'throttled');
    }

    const user = await prisma.user.findUnique({
      where: { usernameHash },
      select: { id: true, passkeys: true },
    });

    const allowCredentials = user
      ? user.passkeys.map((p) => ({
          id: p.credentialId,
          transports: p.transports
            ? (p.transports.split(',') as ('usb' | 'ble' | 'nfc' | 'internal' | 'hybrid')[])
            : undefined,
        }))
      : [];

    const options = await generateAuthenticationOptions({
      rpID: env.RP_ID,
      allowCredentials,
      userVerification: 'preferred',
    });

    await redis.set(authChallengeKey(usernameHash), options.challenge, 'EX', CHALLENGE_TTL);
    res.status(200).json(options);
  }
);

passkeyRouter.post(
  '/auth/passkey/auth/finish',
  rateLimit({ windowSeconds: 10 * 60, max: 20, keyPrefix: 'passkey-auth-finish' }),
  async (req: Request, res: Response): Promise<void> => {
    const input = passkeyAuthFinishSchema.parse(req.body);
    const usernameHash = hashUsername(input.username);
    const ip = clientIp(req);

    const expectedChallenge = await redis.get(authChallengeKey(usernameHash));
    if (!expectedChallenge) throw new HttpError(400, 'No active challenge', 'no_challenge');

    const assertion = input.assertionResponse as AuthenticationResponseJSON;
    const credentialId = z.string().parse(assertion.id);
    const passkey = await prisma.passkey.findUnique({ where: { credentialId } });
    if (!passkey) {
      await recordAuthAttempt(usernameHash, ip, false);
      throw new HttpError(401, 'Unknown credential', 'unknown_credential');
    }
    const userByHash = await prisma.user.findUnique({
      where: { usernameHash },
      select: { id: true },
    });
    if (!userByHash || passkey.userId !== userByHash.id) {
      await recordAuthAttempt(usernameHash, ip, false);
      throw new HttpError(401, 'Credential mismatch', 'credential_mismatch');
    }

    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge,
      expectedOrigin: env.RP_ORIGIN,
      expectedRPID: env.RP_ID,
      credential: {
        id: passkey.credentialId,
        publicKey: Uint8Array.from(passkey.publicKey),
        counter: Number(passkey.counter),
        transports: passkey.transports
          ? (passkey.transports.split(',') as ('usb' | 'ble' | 'nfc' | 'internal' | 'hybrid')[])
          : undefined,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      await recordAuthAttempt(usernameHash, ip, false);
      throw new HttpError(401, 'Verification failed', 'verification_failed');
    }

    await prisma.passkey.update({
      where: { id: passkey.id },
      data: { counter: BigInt(verification.authenticationInfo.newCounter) },
    });
    await redis.del(authChallengeKey(usernameHash));
    await recordAuthAttempt(usernameHash, ip, true);

    const { token: accessToken, expiresAt } = signAccessToken(passkey.userId);
    const refreshToken = await issueRefreshToken(passkey.userId);
    res.status(200).json({
      tokens: { accessToken, refreshToken, expiresAt },
    });
  }
);
