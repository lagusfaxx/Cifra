'use client';

import { create } from 'zustand';
import type { UserPublic } from '@cifra/shared';

/**
 * Contactos en memoria. NO persiste — al cerrar tab se pierden y hay que
 * volver a agregar via username/QR/invite. Esto es por diseño: a) el server
 * no guarda contactos del user, b) el cliente no debe filtrar la red social.
 */
interface ContactsState {
  byUsername: Map<string, UserPublic>;
  add(contact: UserPublic): void;
  remove(username: string): void;
  get(username: string): UserPublic | undefined;
  list(): UserPublic[];
  clear(): void;
}

export const useContactsStore = create<ContactsState>((set, get) => ({
  byUsername: new Map(),
  add(contact) {
    set((s) => {
      const next = new Map(s.byUsername);
      next.set(contact.username, contact);
      return { byUsername: next };
    });
  },
  remove(username) {
    set((s) => {
      const next = new Map(s.byUsername);
      next.delete(username);
      return { byUsername: next };
    });
  },
  get(username) {
    return get().byUsername.get(username);
  },
  list() {
    return Array.from(get().byUsername.values());
  },
  clear() {
    set({ byUsername: new Map() });
  },
}));
