import { Router, type Request, type Response } from 'express';
import {
  signupInitSchema,
  signupVerifySchema,
  signupCompleteSchema,
  isDisposableEmail,
} from '@cifra/shared';
import type {
  SignupInitResponse,
  SignupVerifyResponse,
  SignupCompleteResponse,
} from '@cifra/shared';
import { prisma } from '../lib/db.js';
import { hashUsername, hashEmail, hashCode } from '../lib/hash.js';
import {
  generateNumericCode,
  generateVerificationToken,
  timingEqual,
} from '../lib/verification.js';
import { sendVerificationCode } from '../lib/email.js';
import { signAccessToken, issueRefreshToken } from '../lib/jwt.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { HttpError } from '../middleware/error.js';
import { logger } from '../lib/logger.js';
import { hashVerifierForStorage } from './login.js';

export const signupRouter = Router();

const CODE_TTL_SECONDS = 10 * 60;
const VERIFIED_TTL_SECONDS = 30 * 60;
const MAX_CODE_ATTEMPTS = 5;

signupRouter.post(
  '/auth/signup-init',
  rateLimit({ windowSeconds: 60 * 60, max: 10, keyPrefix: 'signup-init' }),
  async (req: Request, res: Response): Promise<void> => {
    const input = signupInitSchema.parse(req.body);

    if (isDisposableEmail(input.email)) {
      throw new HttpError(400, 'Disposable emails not allowed', 'disposable_email');
    }

    const usernameHash = hashUsername(input.username);
    const emailHash = hashEmail(input.email);

    const [existingUser, existingEmail] = await Promise.all([
      prisma.user.findUnique({ where: { usernameHash } }),
      prisma.user.findUnique({ where: { emailHash } }),
    ]);
    if (existingUser) {
      throw new HttpError(409, 'Username already taken', 'username_taken');
    }
    if (existingEmail) {
      // Respondemos genéricamente para no filtrar que el email ya existe.
      throw new HttpError(409, 'Cannot use this address', 'email_unavailable');
    }

    await prisma.pendingSignup.deleteMany({
      where: { OR: [{ usernameHash }, { emailHash }] },
    });

    const code = generateNumericCode(6);
    const codeHash = hashCode(code, input.username);
    const verificationToken = generateVerificationToken();

    const pending = await prisma.pendingSignup.create({
      data: {
        usernameHash,
        emailHash,
        codeHash,
        verificationToken,
        expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000),
      },
    });

    try {
      await sendVerificationCode(input.email, code);
    } catch (err) {
      logger.error({ err }, 'failed to send verification code');
      throw new HttpError(503, 'Could not send verification email', 'email_send_failed');
    }

    const response: SignupInitResponse = {
      verificationToken,
      expiresAt: pending.expiresAt.getTime(),
    };
    res.status(200).json(response);
  }
);

signupRouter.post(
  '/auth/signup-verify',
  rateLimit({ windowSeconds: 10 * 60, max: 20, keyPrefix: 'signup-verify' }),
  async (req: Request, res: Response): Promise<void> => {
    const input = signupVerifySchema.parse(req.body);
    const usernameHash = hashUsername(input.username);

    const pending = await prisma.pendingSignup.findUnique({ where: { usernameHash } });
    if (!pending || pending.expiresAt < new Date()) {
      throw new HttpError(400, 'Verification code expired or not found', 'code_invalid');
    }
    if (pending.attempts >= MAX_CODE_ATTEMPTS) {
      throw new HttpError(429, 'Too many code attempts', 'code_attempts_exceeded');
    }

    const expectedHash = hashCode(input.code, input.username);
    const matches = timingEqual(pending.codeHash, expectedHash);

    if (!matches) {
      await prisma.pendingSignup.update({
        where: { id: pending.id },
        data: { attempts: { increment: 1 } },
      });
      throw new HttpError(400, 'Invalid code', 'code_invalid');
    }

    const newToken = generateVerificationToken();
    const updated = await prisma.pendingSignup.update({
      where: { id: pending.id },
      data: {
        verified: true,
        verificationToken: newToken,
        expiresAt: new Date(Date.now() + VERIFIED_TTL_SECONDS * 1000),
      },
    });

    const response: SignupVerifyResponse = {
      verificationToken: updated.verificationToken,
      expiresAt: updated.expiresAt.getTime(),
    };
    res.status(200).json(response);
  }
);

signupRouter.post(
  '/auth/signup-complete',
  rateLimit({ windowSeconds: 10 * 60, max: 10, keyPrefix: 'signup-complete' }),
  async (req: Request, res: Response): Promise<void> => {
    const input = signupCompleteSchema.parse(req.body);
    const usernameHash = hashUsername(input.username);

    const pending = await prisma.pendingSignup.findUnique({ where: { usernameHash } });
    if (!pending) {
      throw new HttpError(400, 'No pending signup', 'no_pending');
    }
    if (!pending.verified) {
      throw new HttpError(400, 'Email not verified yet', 'not_verified');
    }
    if (pending.expiresAt < new Date()) {
      throw new HttpError(400, 'Signup session expired', 'session_expired');
    }
    if (!timingEqual(pending.verificationToken, input.verificationToken)) {
      throw new HttpError(403, 'Invalid verification token', 'invalid_token');
    }

    const existingUsername = await prisma.user.findUnique({ where: { usernameHash } });
    if (existingUsername) {
      throw new HttpError(409, 'Username already taken', 'username_taken');
    }

    const storedVerifier = await hashVerifierForStorage(input.pinVerifier);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          usernameHash,
          emailHash: pending.emailHash,
          displayName: input.displayName,
          identityPub: input.identityPub,
          signingPub: input.signingPub,
          encPrivBlob: input.encPrivBlob,
          encPrivNonce: input.encPrivNonce,
          pinSalt: input.pinSalt,
          verifierSalt: input.verifierSalt,
          pinVerifier: storedVerifier,
        },
      });
      await tx.pendingSignup.delete({ where: { id: pending.id } });
      return created;
    });

    const { token: accessToken, expiresAt } = signAccessToken(user.id);
    const refreshToken = await issueRefreshToken(user.id);

    const response: SignupCompleteResponse = {
      userId: user.id,
      tokens: { accessToken, refreshToken, expiresAt },
    };
    res.status(201).json(response);
  }
);
