import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  sendMessageSchema,
  conversationTtlSchema,
  TTL_DEFAULT,
} from '@cifra/shared';
import type { PendingMessageDTO } from '@cifra/shared';
import { prisma } from '../lib/db.js';
import { hashUsername } from '../lib/hash.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { HttpError } from '../middleware/error.js';
import { emitToUser } from '../socket/handler.js';

export const messagesRouter = Router();

function conversationKeyFor(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function getOrCreateConversation(userA: string, userB: string) {
  const [partA, partB] = conversationKeyFor(userA, userB);
  const existing = await prisma.conversation.findUnique({
    where: { participantA_participantB: { participantA: partA, participantB: partB } },
  });
  if (existing) return existing;
  return prisma.conversation.create({
    data: { participantA: partA, participantB: partB, defaultTtl: TTL_DEFAULT },
  });
}

messagesRouter.post(
  '/messages',
  requireAuth,
  rateLimit({ windowSeconds: 60, max: 120, keyPrefix: 'send-msg' }),
  async (req: Request, res: Response): Promise<void> => {
    const input = sendMessageSchema.parse(req.body);
    const senderId = req.userId!;

    const recipient = await prisma.user.findUnique({
      where: { usernameHash: hashUsername(input.recipientUsername) },
      select: { id: true },
    });
    if (!recipient) throw new HttpError(404, 'Recipient not found', 'recipient_not_found');
    if (recipient.id === senderId) throw new HttpError(400, 'Cannot message self', 'self_message');

    await getOrCreateConversation(senderId, recipient.id);

    const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
    const created = await prisma.message.create({
      data: {
        senderId,
        recipientId: recipient.id,
        ciphertext: Buffer.from(input.ciphertext, 'base64'),
        nonce: Buffer.from(input.nonce, 'base64'),
        ephemeralPub: Buffer.from(input.ephemeralPub, 'base64'),
        signature: Buffer.from(input.signature, 'base64'),
        expiresAt,
      },
      select: { id: true, createdAt: true, expiresAt: true },
    });

    emitToUser(recipient.id, 'message:new', { id: created.id });

    res.status(201).json({ id: created.id, expiresAt: created.expiresAt.toISOString() });
  }
);

messagesRouter.get(
  '/messages/pending',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const now = new Date();
    const messages = await prisma.message.findMany({
      where: {
        recipientId: userId,
        expiresAt: { gt: now },
        readAt: null,
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: {
        sender: { select: { id: true, displayName: true, signingPub: true } },
        attachment: { select: { id: true } },
      },
    });

    const senderUsernames = await prisma.user.findMany({
      where: { id: { in: messages.map((m) => m.senderId) } },
      select: { id: true },
    });
    void senderUsernames; // displayName is enough for header; we don't expose plaintext username

    // marcar como delivered
    if (messages.length > 0) {
      await prisma.message.updateMany({
        where: { id: { in: messages.map((m) => m.id) }, deliveredAt: null },
        data: { deliveredAt: new Date() },
      });
    }

    // No conocemos el username plaintext del sender en el server (solo hash).
    // El cliente debe identificarlo via signingPub. En la DTO devolvemos
    // displayName y signingPub; el cliente match vs su contact list.
    const dtos: PendingMessageDTO[] = messages.map((m) => ({
      id: m.id,
      senderUsername: m.sender.displayName, // best effort display; client validates vs contact
      senderSigningPub: m.sender.signingPub,
      ciphertext: m.ciphertext.toString('base64'),
      nonce: m.nonce.toString('base64'),
      ephemeralPub: m.ephemeralPub.toString('base64'),
      signature: m.signature.toString('base64'),
      createdAt: m.createdAt.toISOString(),
      expiresAt: m.expiresAt.toISOString(),
      hasAttachment: m.attachment !== null,
    }));

    res.status(200).json({ messages: dtos });
  }
);

messagesRouter.patch(
  '/messages/:id/read',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const id = z.string().min(1).max(40).parse(req.params.id);
    const userId = req.userId!;
    const msg = await prisma.message.findUnique({
      where: { id },
      select: { id: true, recipientId: true, senderId: true, deliveredAt: true, readAt: true },
    });
    if (!msg || msg.recipientId !== userId) {
      throw new HttpError(404, 'Message not found', 'not_found');
    }
    if (msg.readAt) {
      res.status(204).send();
      return;
    }
    const now = new Date();
    const deliveredAt = msg.deliveredAt ?? now;
    if (deliveredAt) {
      // ya leído + ya entregado → eliminar inmediatamente
      await prisma.message.delete({ where: { id } });
    } else {
      await prisma.message.update({
        where: { id },
        data: { deliveredAt: now, readAt: now },
      });
    }
    emitToUser(msg.senderId, 'message:read', { id });
    res.status(204).send();
  }
);

messagesRouter.get(
  '/conversations',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const convs = await prisma.conversation.findMany({
      where: { OR: [{ participantA: userId }, { participantB: userId }] },
      include: {
        userA: { select: { id: true, displayName: true, identityPub: true, signingPub: true } },
        userB: { select: { id: true, displayName: true, identityPub: true, signingPub: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const items = convs.map((c) => {
      const other = c.userA.id === userId ? c.userB : c.userA;
      return {
        id: c.id,
        defaultTtl: c.defaultTtl,
        isVault: c.isVault,
        contact: {
          displayName: other.displayName,
          identityPub: other.identityPub,
          signingPub: other.signingPub,
        },
      };
    });
    res.status(200).json({ conversations: items });
  }
);

messagesRouter.patch(
  '/conversations/ttl',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const input = conversationTtlSchema.parse(req.body);
    const userId = req.userId!;
    const conv = await prisma.conversation.findUnique({ where: { id: input.conversationId } });
    if (!conv || (conv.participantA !== userId && conv.participantB !== userId)) {
      throw new HttpError(404, 'Conversation not found', 'not_found');
    }
    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: { defaultTtl: input.defaultTtl },
    });
    res.status(204).send();
  }
);
