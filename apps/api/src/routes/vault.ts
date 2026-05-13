import { Router, type Request, type Response } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';

export const vaultRouter = Router();

const setVaultSchema = z.object({
  conversationId: z.string().min(1).max(40),
  vaultPin: z.string().regex(/^[0-9]{6,12}$/, 'PIN must be 6-12 digits'),
});

const verifyVaultSchema = z.object({
  conversationId: z.string().min(1).max(40),
  vaultPin: z.string().regex(/^[0-9]{6,12}$/),
});

const removeVaultSchema = z.object({
  conversationId: z.string().min(1).max(40),
});

async function requireParticipant(conversationId: string, userId: string) {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv || (conv.participantA !== userId && conv.participantB !== userId)) {
    throw new HttpError(404, 'Conversation not found', 'not_found');
  }
  return conv;
}

vaultRouter.post(
  '/conversations/vault/set',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const input = setVaultSchema.parse(req.body);
    const userId = req.userId!;
    await requireParticipant(input.conversationId, userId);
    const hash = await argon2.hash(input.vaultPin, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: { isVault: true, vaultPinHash: hash },
    });
    res.status(204).send();
  }
);

vaultRouter.post(
  '/conversations/vault/verify',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const input = verifyVaultSchema.parse(req.body);
    const userId = req.userId!;
    const conv = await requireParticipant(input.conversationId, userId);
    if (!conv.isVault || !conv.vaultPinHash) {
      throw new HttpError(400, 'Not a vault conversation', 'not_vault');
    }
    const ok = await argon2.verify(conv.vaultPinHash, input.vaultPin).catch(() => false);
    if (!ok) throw new HttpError(401, 'Invalid vault PIN', 'invalid_pin');
    res.status(200).json({ ok: true });
  }
);

vaultRouter.post(
  '/conversations/vault/remove',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const input = removeVaultSchema.parse(req.body);
    const userId = req.userId!;
    await requireParticipant(input.conversationId, userId);
    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: { isVault: false, vaultPinHash: null },
    });
    res.status(204).send();
  }
);
