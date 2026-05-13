'use client';

import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  conversationKey: string;
  direction: 'in' | 'out';
  plaintext: string;
  createdAt: number;
  expiresAt: number;
  read: boolean;
}

interface MessagesState {
  byConversation: Map<string, ChatMessage[]>;
  add(msg: ChatMessage): void;
  markRead(id: string): void;
  remove(id: string): void;
  pruneExpired(): void;
  clearAll(): void;
  list(conversationKey: string): ChatMessage[];
}

/**
 * Mensajes en plaintext SOLO en memoria. Nunca a IndexedDB / localStorage.
 * Al cerrar tab desaparecen. Cuando expira el TTL local, el cliente los
 * limpia incluso si el server no notificó.
 */
export const useMessagesStore = create<MessagesState>((set, get) => ({
  byConversation: new Map(),

  add(msg) {
    set((s) => {
      const next = new Map(s.byConversation);
      const arr = next.get(msg.conversationKey) ?? [];
      next.set(msg.conversationKey, [...arr, msg]);
      return { byConversation: next };
    });
  },

  markRead(id) {
    set((s) => {
      const next = new Map(s.byConversation);
      for (const [k, arr] of next) {
        const updated = arr.map((m) => (m.id === id ? { ...m, read: true } : m));
        next.set(k, updated);
      }
      return { byConversation: next };
    });
  },

  remove(id) {
    set((s) => {
      const next = new Map(s.byConversation);
      for (const [k, arr] of next) {
        next.set(k, arr.filter((m) => m.id !== id));
      }
      return { byConversation: next };
    });
  },

  pruneExpired() {
    const now = Date.now();
    set((s) => {
      const next = new Map(s.byConversation);
      let changed = false;
      for (const [k, arr] of next) {
        const kept = arr.filter((m) => m.expiresAt > now);
        if (kept.length !== arr.length) {
          next.set(k, kept);
          changed = true;
        }
      }
      return changed ? { byConversation: next } : { byConversation: s.byConversation };
    });
  },

  clearAll() {
    set({ byConversation: new Map() });
  },

  list(conversationKey) {
    return get().byConversation.get(conversationKey) ?? [];
  },
}));

export function conversationKey(usernameA: string, usernameB: string): string {
  return [usernameA, usernameB].sort().join(':');
}
