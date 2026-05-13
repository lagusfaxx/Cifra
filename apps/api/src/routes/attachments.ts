import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import {
  uploadUrlSchema,
  registerAttachmentSchema,
  saveRequestCreateSchema,
  saveRequestResolveSchema,
} from '@cifra/shared';
import { prisma } from '../lib/db.js';
import { minio, BUCKET } from '../lib/minio.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { HttpError } from '../middleware/error.js';
import { emitToUser } from '../socket/handler.js';
import { logger } from '../lib/logger.js';

export const attachmentsRouter = Router();

const PRESIGN_TTL = 5 * 60;
const DOWNLOAD_TTL = 5 * 60;

attachmentsRouter.post(
  '/attachments/upload-url',
  requireAuth,
  rateLimit({ windowSeconds: 60, max: 30, keyPrefix: 'attachment-upload' }),
  async (req: Request, res: Response): Promise<void> => {
    const input = uploadUrlSchema.parse(req.body);
    const userId = req.userId!;
    const storageKey = `${userId}/${Date.now()}-${nanoid(16)}`;

    try {
      const url = await minio.presignedPutObject(BUCKET, storageKey, PRESIGN_TTL);
      res.status(200).json({ url, storageKey, mimeType: input.mimeType, sizeBytes: input.sizeBytes });
    } catch (err) {
      logger.error({ err }, 'failed to presign upload');
      throw new HttpError(500, 'Could not presign upload', 'presign_failed');
    }
  }
);

attachmentsRouter.post(
  '/attachments',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const input = registerAttachmentSchema.parse(req.body);
    const userId = req.userId!;

    const message = await prisma.message.findUnique({
      where: { id: input.messageId },
      select: { id: true, senderId: true, expiresAt: true, attachment: true },
    });
    if (!message || message.senderId !== userId) {
      throw new HttpError(404, 'Message not found', 'not_found');
    }
    if (message.attachment) {
      throw new HttpError(409, 'Attachment already registered', 'already_registered');
    }

    const attachment = await prisma.attachment.create({
      data: {
        messageId: input.messageId,
        storageKey: input.storageKey,
        wrappedKey: Buffer.from(input.wrappedKey, 'base64'),
        wrappedKeyNonce: Buffer.from(input.wrappedKeyNonce, 'base64'),
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        expiresAt: message.expiresAt,
      },
    });
    res.status(201).json({ id: attachment.id });
  }
);

attachmentsRouter.get(
  '/attachments/:id/download-url',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const id = z.string().min(1).max(40).parse(req.params.id);
    const userId = req.userId!;
    const attachment = await prisma.attachment.findUnique({
      where: { id },
      include: { message: { select: { senderId: true, recipientId: true } } },
    });
    if (!attachment) throw new HttpError(404, 'Attachment not found', 'not_found');
    if (
      attachment.message.senderId !== userId &&
      attachment.message.recipientId !== userId
    ) {
      throw new HttpError(403, 'Forbidden', 'forbidden');
    }
    if (attachment.expiresAt < new Date()) {
      throw new HttpError(410, 'Attachment expired', 'expired');
    }

    const url = await minio.presignedGetObject(BUCKET, attachment.storageKey, DOWNLOAD_TTL);
    res.status(200).json({
      url,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      wrappedKey: attachment.wrappedKey.toString('base64'),
      wrappedKeyNonce: attachment.wrappedKeyNonce.toString('base64'),
    });
  }
);

attachmentsRouter.post(
  '/save-requests',
  requireAuth,
  rateLimit({ windowSeconds: 60 * 60, max: 30, keyPrefix: 'save-req-create' }),
  async (req: Request, res: Response): Promise<void> => {
    const input = saveRequestCreateSchema.parse(req.body);
    const userId = req.userId!;
    const attachment = await prisma.attachment.findUnique({
      where: { id: input.attachmentId },
      include: { message: { select: { senderId: true, recipientId: true } } },
    });
    if (!attachment) throw new HttpError(404, 'Attachment not found', 'not_found');
    if (attachment.message.recipientId !== userId) {
      throw new HttpError(403, 'Only the recipient can request save', 'forbidden');
    }
    if (attachment.saveAllowed) {
      throw new HttpError(400, 'Already approved', 'already_approved');
    }

    const ownerId = attachment.message.senderId;

    const existing = await prisma.saveRequest.findFirst({
      where: { attachmentId: input.attachmentId, requesterId: userId, status: 'PENDING' },
    });
    if (existing) {
      res.status(200).json({ id: existing.id, status: existing.status });
      return;
    }

    const created = await prisma.saveRequest.create({
      data: { attachmentId: input.attachmentId, requesterId: userId, ownerId },
    });
    emitToUser(ownerId, 'save-request:created', {
      requestId: created.id,
      attachmentId: input.attachmentId,
    });
    res.status(201).json({ id: created.id, status: created.status });
  }
);

attachmentsRouter.post(
  '/save-requests/resolve',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const input = saveRequestResolveSchema.parse(req.body);
    const userId = req.userId!;
    const saveReq = await prisma.saveRequest.findUnique({
      where: { id: input.requestId },
    });
    if (!saveReq || saveReq.ownerId !== userId) {
      throw new HttpError(404, 'Request not found', 'not_found');
    }
    if (saveReq.status !== 'PENDING') {
      throw new HttpError(400, 'Already resolved', 'already_resolved');
    }
    const status = input.approve ? 'APPROVED' : 'DENIED';
    await prisma.$transaction(async (tx) => {
      await tx.saveRequest.update({
        where: { id: saveReq.id },
        data: { status, resolvedAt: new Date() },
      });
      if (input.approve) {
        await tx.attachment.update({
          where: { id: saveReq.attachmentId },
          data: { saveAllowed: true },
        });
      }
    });
    emitToUser(saveReq.requesterId, 'save-request:resolved', {
      requestId: saveReq.id,
      approved: input.approve,
    });
    res.status(200).json({ status });
  }
);

attachmentsRouter.get(
  '/save-requests/pending',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.userId!;
    const list = await prisma.saveRequest.findMany({
      where: { ownerId: userId, status: 'PENDING' },
      include: { requester: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ requests: list });
  }
);
