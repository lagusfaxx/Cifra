'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/**
 * Landing público para invite links. No expone nada: solo guarda el link
 * completo (con el fragmento) en sessionStorage y redirige al flow de
 * canje. Si el user no está logueado lo manda a /signup.
 */
export default function InviteLandingPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const full = window.location.href;
    sessionStorage.setItem('cifra.invite.pending', full);
    router.replace('/contacts/add?from=invite');
  }, [params.token, router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="text-sm text-muted-foreground">Procesando invitación…</div>
    </main>
  );
}
