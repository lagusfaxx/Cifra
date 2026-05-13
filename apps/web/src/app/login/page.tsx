'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, setTokens, ApiError } from '@/lib/api';
import {
  ensureCryptoReady,
  deriveVerifier,
  deriveKEK,
  decryptPrivBlob,
  fromBase64,
  toBase64,
  memzero,
  zeroKEK,
} from '@/lib/crypto-client';
import { USERNAME_REGEX, PIN_REGEX } from '@cifra/shared';
import type { LoginInitResponse, LoginVerifyResponse } from '@cifra/shared';
import { useAppStore } from '@/store/useAppStore';

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAppStore((s) => s.setSession);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!USERNAME_REGEX.test(username)) {
      setError('Username inválido');
      return;
    }
    if (!PIN_REGEX.test(pin)) {
      setError('PIN inválido');
      return;
    }
    setBusy(true);
    try {
      await ensureCryptoReady();
      const init = await api<LoginInitResponse>('/auth/login-init', {
        method: 'POST',
        body: { username },
        auth: false,
      });

      const verifierSalt = fromBase64(init.verifierSalt);
      const pinSalt = fromBase64(init.pinSalt);
      const verifier = deriveVerifier(pin, verifierSalt);

      const verify = await api<LoginVerifyResponse>('/auth/login-verify', {
        method: 'POST',
        body: { username, pinVerifier: toBase64(verifier) },
        auth: false,
      });
      memzero(verifier);

      const kek = deriveKEK(pin, pinSalt);
      const identityKeys = decryptPrivBlob(
        { ciphertext: verify.encPrivBlob, nonce: verify.encPrivNonce },
        kek
      );
      zeroKEK(kek);

      setTokens(verify.tokens.accessToken, verify.tokens.refreshToken);
      setSession({
        username,
        identityKeys,
        accessToken: verify.tokens.accessToken,
        refreshToken: verify.tokens.refreshToken,
        hasPasskey: verify.hasPasskey,
      });
      setPin('');
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de autenticación');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>El PIN nunca sale de este dispositivo.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                autoComplete="username"
                spellCheck={false}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">PIN</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              Entrar
            </Button>
            <div className="text-center text-xs text-muted-foreground">
              <a href="/recover" className="underline">
                Recuperar cuenta con frase
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
