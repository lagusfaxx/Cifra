import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { updateProfileSchema, usernameSchema } from '@cifra/shared';
import type { UserPublic } from '@cifra/shared';
import { prisma } from '../lib/db.js';
import { hashUsername } from '../lib/hash.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';

export const usersRouter = Router();

usersRouter.get(
  '/users/by-username/:username',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = usernameSchema.safeParse(req.params.username);
    if (!parsed.success) throw new HttpError(400, 'Invalid username', 'invalid_username');
    const username = parsed.data;
    const user = await prisma.user.findUnique({
      where: { usernameHash: hashUsername(username) },
      select: { displayName: true, identityPub: true, signingPub: true },
    });
    if (!user) throw new HttpError(404, 'User not found', 'not_found');
    const response: UserPublic = {
      username,
      displayName: user.displayName,
      identityPub: user.identityPub,
      signingPub: user.signingPub,
    };
    res.status(200).json(response);
  }
);

usersRouter.patch(
  '/users/me',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const input = updateProfileSchema.parse(req.body);
    const updated = await prisma.user.update({
      where: { id: req.userId! },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      },
      select: { displayName: true, identityPub: true, signingPub: true },
    });
    res.status(200).json(updated);
  }
);

usersRouter.get(
  '/users/me',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: {
        id: true,
        displayName: true,
        identityPub: true,
        signingPub: true,
        passkeys: { select: { id: true, deviceName: true, createdAt: true } },
        createdAt: true,
      },
    });
    if (!user) throw new HttpError(404, 'User not found', 'not_found');
    res.status(200).json(user);
  }
);

usersRouter.delete(
  '/users/me',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const confirmSchema = z.object({ confirm: z.literal('DELETE') });
    confirmSchema.parse(req.body);
    await prisma.user.delete({ where: { id: req.userId! } });
    res.status(204).send();
  }
);
