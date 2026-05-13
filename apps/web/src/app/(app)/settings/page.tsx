'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ApiError, getRefreshToken, setTokens } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { useMessagesStore } from '@/lib/messages-store';
import { useContactsStore } from '@/lib/contacts-store';
import { registerPasskey } from '@/lib/passkey-client';
import { Fingerprint, LogOut, Trash2, ShieldCheck, FileText } from 'lucide-react';

interface MeResponse {
  id: string;
  displayName: string;
  identityPub: string;
  signingPub: string;
  passkeys: Array<{ id: string; deviceName: string | null; createdAt: string }>;
  createdAt: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const logoutStore = useAppStore((s) => s.logout);
  const username = useAppStore((s) => s.username);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await api<MeResponse>('/users/me');
        setMe(data);
      } catch (e) {
        setErr(e instanceof ApiError ? e.message : 'Error');
      }
    })();
  }, []);

  async function addPasskey() {
    setErr(null);
    setBusy(true);
    try {
      const name = window.prompt('Nombre del dispositivo (opcional)') ?? undefined;
      await registerPasskey(name);
      const data = await api<MeResponse>('/users/me');
      setMe(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error registrando passkey');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      const refresh = getRefreshToken();
      if (refresh) {
        await api('/auth/logout', { method: 'POST', body: { refreshToken: refresh }, auth: false }).catch(
          () => null
        );
      }
    } finally {
      setTokens(null, null);
      useMessagesStore.getState().clearAll();
      useContactsStore.getState().clear();
      logoutStore();
      router.replace('/login');
    }
  }

  async function deleteAccount() {
    if (!window.confirm('¿Borrar tu cuenta para siempre? No se puede deshacer.')) return;
    setBusy(true);
    try {
      await api('/users/me', { method: 'DELETE', body: { confirm: 'DELETE' } });
      logoutStore();
      router.replace('/');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Configuración</h1>
          <p className="text-sm text-muted-foreground">@{username}</p>
        </header>

        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {err}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Fingerprint className="h-5 w-5" /> Passkeys
            </CardTitle>
            <CardDescription>
              Segundo factor opcional. Si tu dispositivo soporta huella / FaceID / YubiKey,
              registralo acá. Reduce el riesgo en caso de PIN robado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {me?.passkeys.length === 0 && (
              <p className="text-sm text-muted-foreground">No tenés passkeys registrados.</p>
            )}
            {me?.passkeys.map((p) => (
              <div key={p.id} className="flex justify-between text-sm border rounded-md p-2">
                <span>{p.deviceName ?? 'Sin nombre'}</span>
                <span className="text-muted-foreground text-xs">
                  {new Date(p.createdAt).toLocaleDateString('es-CL')}
                </span>
              </div>
            ))}
            <Button onClick={addPasskey} disabled={busy} variant="outline" size="sm">
              Registrar passkey
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Modelo de seguridad
            </CardTitle>
            <CardDescription>
              Conocé qué protege Cifra y qué no.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/security">
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4" /> Ver explicación
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sesión</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" onClick={logout} disabled={busy} className="w-full">
              <LogOut className="h-4 w-4" /> Cerrar sesión y limpiar este dispositivo
            </Button>
            <Button
              variant="destructive"
              onClick={deleteAccount}
              disabled={busy}
              className="w-full"
            >
              <Trash2 className="h-4 w-4" /> Borrar cuenta definitivamente
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
