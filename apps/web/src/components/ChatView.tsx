'use client';

import { useEffect, useRef } from 'react';
import { ShieldCheck, Clock, Check, CheckCheck } from 'lucide-react';
import type { UserPublic } from '@cifra/shared';
import { useMessagesStore, conversationKey, type ChatMessage } from '@/lib/messages-store';
import { useAppStore } from '@/store/useAppStore';
import { safetyNumber, fromBase64 } from '@/lib/crypto-client';
import { cn } from '@/lib/cn';

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return 'expirado';
  const m = Math.floor(ms / 60000);
  if (m < 1) return `${Math.ceil(ms / 1000)}s`;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function ChatView({ contact }: { contact: UserPublic }) {
  const myUsername = useAppStore((s) => s.username);
  const identityKeys = useAppStore((s) => s.identityKeys);
  const messages = useMessagesStore((s) =>
    myUsername ? s.list(conversationKey(myUsername, contact.username)) : []
  );
  const pruneExpired = useMessagesStore((s) => s.pruneExpired);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => pruneExpired(), 10_000);
    return () => clearInterval(t);
  }, [pruneExpired]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const fingerprint = identityKeys
    ? safetyNumber(identityKeys.identity.publicKey, fromBase64(contact.identityPub)).slice(0, 32)
    : '';

  return (
    <div className="flex flex-col h-screen flex-1">
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm">{contact.displayName}</div>
          <div className="text-xs text-muted-foreground">@{contact.username}</div>
        </div>
        <div
          className="flex items-center gap-1 text-xs text-muted-foreground"
          title="Safety number — verificá en persona"
        >
          <ShieldCheck className="h-4 w-4" />
          <code className="font-mono">{fingerprint.slice(0, 8)}…</code>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 secure-view">
        {messages.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            Conversación cifrada de extremo a extremo. Empezá a escribir.
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isOut = message.direction === 'out';
  return (
    <div className={cn('flex', isOut ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
          isOut ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        <div className="whitespace-pre-wrap break-words">{message.plaintext}</div>
        <div
          className={cn(
            'flex items-center gap-1 text-[10px] mt-1',
            isOut ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
        >
          <Clock className="h-3 w-3" />
          <span>{formatTimeLeft(message.expiresAt - Date.now())}</span>
          {isOut && (message.read ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
        </div>
      </div>
    </div>
  );
}
