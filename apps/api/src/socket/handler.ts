import type { Server as HttpServer } from 'node:http';
import { Server as IoServer } from 'socket.io';
import { getEnv } from '../lib/env.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';

let io: IoServer | null = null;

const socketsByUser = new Map<string, Set<string>>();

export function setupSocket(server: HttpServer): IoServer {
  const env = getEnv();
  io = new IoServer(server, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
    serveClient: false,
    pingInterval: 25_000,
    pingTimeout: 60_000,
  });

  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      (socket.handshake.headers.authorization?.startsWith('Bearer ')
        ? socket.handshake.headers.authorization.slice(7)
        : undefined);
    if (!token) {
      next(new Error('unauthorized'));
      return;
    }
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    let set = socketsByUser.get(userId);
    if (!set) {
      set = new Set();
      socketsByUser.set(userId, set);
    }
    set.add(socket.id);
    logger.debug({ userId, socketId: socket.id }, 'socket connected');

    socket.on('disconnect', () => {
      const s = socketsByUser.get(userId);
      if (s) {
        s.delete(socket.id);
        if (s.size === 0) socketsByUser.delete(userId);
      }
    });
  });

  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!io) return;
  const sockets = socketsByUser.get(userId);
  if (!sockets || sockets.size === 0) return;
  for (const id of sockets) {
    io.to(id).emit(event, payload);
  }
}

export function getOnlineCount(): number {
  return socketsByUser.size;
}
