import { Router, type Request, type Response } from 'express';
import sodium from 'libsodium-wrappers-sumo';
import { recoverInitSchema, recoverCompleteSchema } from '@cifra/shared';
import type { RecoverInitResponse, RecoverCompleteResponse } from '@cifra/shared';
import { prisma } from '../lib/db.js';
import { hashUsername } from '../lib/hash.js';
import {
  signAccessToken,
  issueRefreshToken,
  revokeAllRefreshTokensForUser,
} from '../lib/jwt.js';
import { rateLimit, clientIp } from '../middleware/rate-limit.js';
import { HttpError } from '../middleware/error.js';
import { checkAuthThrottle, recordAuthAttempt } from '../lib/auth-throttle.js';
import { createChallenge, consumeChallenge } from '../lib/challenge.js';
import { hashVerifierForStorage } from './login.js';

export const recoverRouter = Router();

recoverRouter.post(
  '/auth/recover-init',
  rateLimit({ windowSeconds: 60 * 60, max: 5, keyPrefix: 'recover-init' }),
  async (req: Request, res: Response): Promise<void> => {
    const input = recoverInitSchema.parse(req.body);
    const usernameHash = hashUsername(input.username);
    const ip = clientIp(req);

    const throttle = await checkAuthThrottle(usernameHash, ip);
    if (!throttle.allowed) {
      res.setHeader('Retry-After', String(Math.max(throttle.retryAfterSeconds, 1)));
      throw new HttpError(429, throttle.reason ?? 'Throttled', 'throttled');
    }

    const user = await prisma.user.findUnique({
      where: { usernameHash },
      select: { id: true, signingPub: true },
    });

    // No filtramos existencia: si el user no existe igualmente devolvemos un
    // challenge con un signingPub fake. La verificación falla en el siguiente paso.
    if (!user) {
      const challenge = await createChallenge('RECOVERY', null);
      const fakePub = Buffer.alloc(32, 0).toString('base64');
      const response: RecoverInitResponse = {
        challenge,
        signingPub: fakePub,
      };
      res.status(200).json(response);
      return;
    }

    const challenge = await createChallenge('RECOVERY', user.id);
    const response: RecoverInitResponse = {
      challenge,
      signingPub: user.signingPub,
    };
    res.status(200).json(response);
  }
);

recoverRouter.post(
  '/auth/recover-complete',
  rateLimit({ windowSeconds: 60 * 60, max: 5, keyPrefix: 'recover-complete' }),
  async (req: Request, res: Response): Promise<void> => {
    const input = recoverCompleteSchema.parse(req.body);
    const usernameHash = hashUsername(input.username);
    const ip = clientIp(req);

    const user = await prisma.user.findUnique({
      where: { usernameHash },
      select: { id: true, signingPub: true },
    });
    if (!user) {
      await recordAuthAttempt(usernameHash, ip, false);
      throw new HttpError(401, 'Invalid recovery', 'invalid_recovery');
    }

    const consumed = await consumeChallenge(input.challenge, 'RECOVERY');
    if (!consumed || consumed.userId !== user.id) {
      await recordAuthAttempt(usernameHash, ip, false);
      throw new HttpError(401, 'Invalid recovery challenge', 'invalid_recovery');
    }

    await sodium.ready;
    let challengeBytes: Uint8Array;
    let signatureBytes: Uint8Array;
    let signingPub: Uint8Array;
    try {
      challengeBytes = sodium.from_base64(input.challenge, sodium.base64_variants.ORIGINAL);
      signatureBytes = sodium.from_base64(input.signature, sodium.base64_variants.ORIGINAL);
      signingPub = sodium.from_base64(user.signingPub, sodium.base64_variants.ORIGINAL);
    } catch {
      await recordAuthAttempt(usernameHash, ip, false);
      throw new HttpError(400, 'Invalid encoding', 'invalid_encoding');
    }

    const sigOk = sodium.crypto_sign_verify_detached(signatureBytes, challengeBytes, signingPub);
    if (!sigOk) {
      await recordAuthAttempt(usernameHash, ip, false);
      throw new HttpError(401, 'Invalid signature', 'invalid_signature');
    }

    const newStoredVerifier = await hashVerifierForStorage(input.newPinVerifier);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          encPrivBlob: input.newEncPrivBlob,
          encPrivNonce: input.newEncPrivNonce,
          pinSalt: input.newPinSalt,
          verifierSalt: input.newVerifierSalt,
          pinVerifier: newStoredVerifier,
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.passkey.deleteMany({ where: { userId: user.id } });
    });

    await revokeAllRefreshTokensForUser(user.id);
    await recordAuthAttempt(usernameHash, ip, true);

    const { token: accessToken, expiresAt } = signAccessToken(user.id);
    const refreshToken = await issueRefreshToken(user.id);

    const response: RecoverCompleteResponse = {
      tokens: { accessToken, refreshToken, expiresAt },
      userId: user.id,
    };
    res.status(200).json(response);
  }
);
