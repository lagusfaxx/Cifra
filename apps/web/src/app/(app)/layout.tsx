'use client';

import { useEffect } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { useAppStore } from '@/store/useAppStore';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { fetchAndDecryptPending, processIncomingMessage } from '@/lib/message-flow';
import { api } from '@/lib/api';
import type { PendingMessageDTO } from '@cifra/shared';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const accessToken = useAppStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return;
    const socket = connectSocket(accessToken);

    socket.on('connect', () => {
      void fetchAndDecryptPending();
    });

    socket.on('message:new', async ({ id }: { id: string }) => {
      try {
        const res = await api<{ messages: PendingMessageDTO[] }>('/messages/pending');
        const target = res.messages.find((m) => m.id === id) ?? res.messages[0];
        if (target) await processIncomingMessage(target);
      } catch {
        // ignore
      }
    });

    return () => {
      socket.off('connect');
      socket.off('message:new');
      disconnectSocket();
    };
  }, [accessToken]);

  return <AuthGuard>{children}</AuthGuard>;
}
