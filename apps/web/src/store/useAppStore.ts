'use client';

import { create } from 'zustand';
import type { IdentityKeys } from '@cifra/crypto';

/**
 * Store en memoria. NO persiste:
 *   - identityKeys (privkeys)
 *   - displayName, username (re-fetched al login)
 *   - mensajes en plaintext (viven solo en estado de React efímero)
 *
 * SI persiste en sessionStorage (auto-cleared al cerrar tab):
 *   - access/refresh tokens, para sobrevivir un soft refresh durante una sesión
 *
 * Persistir tokens en localStorage sería un riesgo: cualquier XSS los robaría
 * y duraría hasta que el user logout. sessionStorage al menos limpia al cerrar.
 */
interface SessionState {
  userId: string | null;
  username: string | null;
  displayName: string | null;
  identityKeys: IdentityKeys | null;
  accessToken: string | null;
  refreshToken: string | null;
  hasPasskey: boolean;
}

interface AppStore extends SessionState {
  setSession(state: Partial<SessionState>): void;
  logout(): void;
  isAuthenticated(): boolean;
}

const SESSION_STORAGE_KEY = 'cifra.session.v1';

function loadInitialSession(): Pick<SessionState, 'accessToken' | 'refreshToken'> {
  if (typeof window === 'undefined') return { accessToken: null, refreshToken: null };
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return { accessToken: null, refreshToken: null };
    const parsed = JSON.parse(raw) as { accessToken?: string; refreshToken?: string };
    return {
      accessToken: parsed.accessToken ?? null,
      refreshToken: parsed.refreshToken ?? null,
    };
  } catch {
    return { accessToken: null, refreshToken: null };
  }
}

function persistTokens(access: string | null, refresh: string | null): void {
  if (typeof window === 'undefined') return;
  if (!access || !refresh) {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ accessToken: access, refreshToken: refresh })
  );
}

export const useAppStore = create<AppStore>((set, get) => ({
  userId: null,
  username: null,
  displayName: null,
  identityKeys: null,
  hasPasskey: false,
  ...loadInitialSession(),

  setSession(state) {
    set((prev) => {
      const next = { ...prev, ...state };
      persistTokens(next.accessToken, next.refreshToken);
      return next;
    });
  },

  logout() {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      void (async () => {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch {
          /* ignore */
        }
      })();
    }
    set({
      userId: null,
      username: null,
      displayName: null,
      identityKeys: null,
      accessToken: null,
      refreshToken: null,
      hasPasskey: false,
    });
  },

  isAuthenticated() {
    return get().accessToken !== null;
  },
}));
