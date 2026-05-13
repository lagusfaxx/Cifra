'use client';

import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function connectSocket(accessToken: string): Socket {
  if (socket && socket.connected) return socket;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socket = io(API_URL, {
    transports: ['websocket'],
    auth: { token: accessToken },
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1_000,
    withCredentials: true,
  });
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}
