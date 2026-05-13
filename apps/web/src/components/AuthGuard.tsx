'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { setTokens } from '@/lib/api';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const accessToken = useAppStore((s) => s.accessToken);
  const refreshToken = useAppStore((s) => s.refreshToken);
  const identityKeys = useAppStore((s) => s.identityKeys);

  useEffect(() => {
    if (accessToken) setTokens(accessToken, refreshToken);
  }, [accessToken, refreshToken]);

  useEffect(() => {
    if (!accessToken || !identityKeys) {
      router.replace('/login');
    }
  }, [accessToken, identityKeys, router]);

  if (!accessToken || !identityKeys) return null;
  return <>{children}</>;
}
