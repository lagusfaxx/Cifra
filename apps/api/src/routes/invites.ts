import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { redeemInviteSchema } from '@cifra/shared';
import type { InviteRedeemResponse } from '@cifra/shared';
import { prisma } from '../lib/db.js';
import { hashInviteToken } from '../lib/hash.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { HttpError } from '../middleware/error.js';

export const invitesRouter = Router();

const INVITE_TTL_SECONDS = 24 * 60 * 60;

invitesRouter.post(
  '/invites',
  requireAuth,
  rateLimit({ windowSeconds: 60 * 60, max: 20, keyPrefix: 'invite-create' }),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const token = randomBytes(24).toString('base64url');
    await prisma.inviteLink.create({
      data: {
        tokenHash: hashInviteToken(token),
        inviterId: userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_SECONDS * 1000),
      },
    });
    res.status(201).json({
      token,
      expiresAt: new Date(Date.now() + INVITE_TTL_SECONDS * 1000).toISOString(),
    });
  }
);

invitesRouter.post(
  '/invites/redeem',
  requireAuth,
  rateLimit({ windowSeconds: 60 * 60, max: 60, keyPrefix: 'invite-redeem' }),
  async (req: Request, res: Response): Promise<void> => {
    const input = redeemInviteSchema.parse(req.body);
    const tokenHash = hashInviteToken(input.token);

    const invite = await prisma.inviteLink.findUnique({
      where: { tokenHash },
      include: {
        inviter: {
          select: { displayName: true, identityPub: true, signingPub: true, usernameHash: true },
        },
      },
    });
    if (!invite) throw new HttpError(404, 'Invite not found', 'invite_not_found');
    if (invite.usedAt) throw new HttpError(410, 'Invite already used', 'invite_used');
    if (invite.expiresAt < new Date()) {
      throw new HttpError(410, 'Invite expired', 'invite_expired');
    }
    if (invite.inviterId === req.userId) {
      throw new HttpError(400, 'Cannot redeem own invite', 'self_invite');
    }

    await prisma.inviteLink.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });

    // Username plaintext no se almacena. El cliente DEBE conocer el username
    // via el token o vía in-app. Pero como el invite link es genérico, el
    // inviter incluye su username en el QR/link metadata client-side (no
    // se transmite por el server).
    // Acá devolvemos solo los datos públicos. El cliente del invitee deberá
    // tener el username plaintext del lado del link generado.
    const response: Pick<InviteRedeemResponse, 'inviter'> = {
      inviter: {
        username: '',
        displayName: invite.inviter.displayName,
        identityPub: invite.inviter.identityPub,
        signingPub: invite.inviter.signingPub,
      },
    };
    res.status(200).json(response);
  }
);
