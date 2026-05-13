'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QRDisplay } from '@/components/QRDisplay';
import { QRScanner } from '@/components/QRScanner';
import { api, ApiError } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { useContactsStore } from '@/lib/contacts-store';
import { USERNAME_REGEX, type UserPublic } from '@cifra/shared';
import { createSignedCard, serializeCard, verifyAndParseCard } from '@/lib/qr-card';
import { safetyNumber, fromBase64 } from '@/lib/crypto-client';
import { Copy, Check } from 'lucide-react';

type Mode = 'username' | 'qr-show' | 'qr-scan' | 'invite-create' | 'invite-redeem';

export default function AddContactPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('username');
  const username = useAppStore((s) => s.username);
  const displayName = useAppStore((s) => s.displayName) ?? username ?? '';
  const identityKeys = useAppStore((s) => s.identityKeys);
  const addContact = useContactsStore((s) => s.add);

  return (
    <main className="min-h-screen flex flex-col items-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Agregar contacto</CardTitle>
          <CardDescription>
            Solo tres formas: por username exacto, por QR en persona, o por link de invitación de 24h.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-6">
            <Button size="sm" variant={mode === 'username' ? 'default' : 'outline'} onClick={() => setMode('username')}>
              Username
            </Button>
            <Button size="sm" variant={mode === 'qr-show' ? 'default' : 'outline'} onClick={() => setMode('qr-show')}>
              Mostrar QR
            </Button>
            <Button size="sm" variant={mode === 'qr-scan' ? 'default' : 'outline'} onClick={() => setMode('qr-scan')}>
              Escanear QR
            </Button>
            <Button size="sm" variant={mode === 'invite-create' ? 'default' : 'outline'} onClick={() => setMode('invite-create')}>
              Crear link
            </Button>
            <Button size="sm" variant={mode === 'invite-redeem' ? 'default' : 'outline'} onClick={() => setMode('invite-redeem')}>
              Usar link
            </Button>
          </div>

          {mode === 'username' && (
            <ByUsername
              onAdded={(c) => {
                addContact(c);
                router.push(`/chat/${c.username}`);
              }}
            />
          )}

          {mode === 'qr-show' && username && identityKeys && (
            <ShowQR username={username} displayName={displayName} />
          )}

          {mode === 'qr-scan' && (
            <ScanQR
              onAdded={(c) => {
                addContact(c);
                router.push(`/chat/${c.username}`);
              }}
            />
          )}

          {mode === 'invite-create' && <CreateInvite username={username ?? ''} displayName={displayName} />}

          {mode === 'invite-redeem' && (
            <RedeemInvite
              onAdded={(c) => {
                addContact(c);
                router.push(`/chat/${c.username}`);
              }}
            />
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function ByUsername({ onAdded }: { onAdded: (c: UserPublic) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!USERNAME_REGEX.test(value)) {
      setError('Username inválido');
      return;
    }
    setBusy(true);
    try {
      const user = await api<{
        displayName: string;
        identityPub: string;
        signingPub: string;
      }>(`/users/by-username/${encodeURIComponent(value)}`);
      onAdded({
        username: value,
        displayName: user.displayName,
        identityPub: user.identityPub,
        signingPub: user.signingPub,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No encontrado');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="u">Username (exacto)</Label>
        <Input
          id="u"
          value={value}
          onChange={(e) => setValue(e.target.value.toLowerCase())}
          placeholder="alcalde_2024"
          autoComplete="off"
        />
      </div>
      <Button type="submit" disabled={busy} className="w-full">
        Agregar
      </Button>
    </form>
  );
}

function ShowQR({ username, displayName }: { username: string; displayName: string }) {
  const identityKeys = useAppStore((s) => s.identityKeys);
  const [serialized, setSerialized] = useState<string | null>(null);

  if (!identityKeys) return null;

  if (!serialized) {
    void (async () => {
      const card = await createSignedCard(username, displayName, identityKeys);
      setSerialized(serializeCard(card));
    })();
    return <div className="text-sm text-muted-foreground">Generando QR…</div>;
  }

  const fingerprint = safetyNumber(
    identityKeys.identity.publicKey,
    identityKeys.identity.publicKey
  ).slice(0, 32);

  return (
    <div className="flex flex-col items-center gap-4">
      <QRDisplay data={serialized} />
      <div className="text-center text-sm">
        <div className="font-medium">@{username}</div>
        <div className="text-muted-foreground text-xs">
          Mostrale este QR a la otra persona para que te agregue al instante.
        </div>
        <div className="mt-2 text-xs font-mono text-muted-foreground">
          Tu fingerprint: {fingerprint.slice(0, 16)}
        </div>
      </div>
    </div>
  );
}

function ScanQR({ onAdded }: { onAdded: (c: UserPublic) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [decoded, setDecoded] = useState(false);

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </div>
      )}
      {!decoded && (
        <QRScanner
          onDecode={async (text) => {
            if (decoded) return;
            setDecoded(true);
            const card = await verifyAndParseCard(text);
            if (!card) {
              setError('QR inválido o signature no verifica');
              setDecoded(false);
              return;
            }
            onAdded({
              username: card.u,
              displayName: card.d,
              identityPub: card.ip,
              signingPub: card.sp,
            });
          }}
          onError={(err) => setError(err.message)}
        />
      )}
    </div>
  );
}

function CreateInvite({ username, displayName }: { username: string; displayName: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ token: string; expiresAt: string }>('/invites', {
        method: 'POST',
        body: {},
      });
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      const url = `${base}/i/${res.token}#u=${encodeURIComponent(username)}&d=${encodeURIComponent(displayName)}`;
      setLink(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error generando link');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </div>
      )}
      {!link ? (
        <>
          <p className="text-sm text-muted-foreground">
            Generá un link que el invitado puede usar una sola vez en las próximas 24h.
          </p>
          <Button onClick={generate} disabled={busy} className="w-full">
            Generar link
          </Button>
        </>
      ) : (
        <>
          <div className="rounded-md border bg-muted p-3 text-xs font-mono break-all">{link}</div>
          <Button onClick={copy} variant="outline" className="w-full">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copiado' : 'Copiar link'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Compartí el link por un canal que confíes. El link caduca en 24h o tras un uso.
          </p>
        </>
      )}
    </div>
  );
}

function RedeemInvite({ onAdded }: { onAdded: (c: UserPublic) => void }) {
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const url = new URL(link.trim());
      const tokenMatch = url.pathname.match(/\/i\/([^/]+)/);
      const token = tokenMatch?.[1];
      if (!token) throw new Error('Link inválido');
      const params = new URLSearchParams(url.hash.slice(1));
      const u = params.get('u');
      if (!u) throw new Error('Link sin metadata de usuario');

      const res = await api<{
        inviter: { displayName: string; identityPub: string; signingPub: string };
      }>('/invites/redeem', { method: 'POST', body: { token } });

      onAdded({
        username: u,
        displayName: res.inviter.displayName,
        identityPub: res.inviter.identityPub,
        signingPub: res.inviter.signingPub,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo canjear');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="link">Pegá el link recibido</Label>
        <Input
          id="link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://cifra.app/i/..."
          autoComplete="off"
        />
      </div>
      <Button type="submit" disabled={busy} className="w-full">
        Canjear
      </Button>
    </form>
  );
}
