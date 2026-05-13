'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import sodium from 'libsodium-wrappers-sumo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, setTokens, ApiError } from '@/lib/api';
import {
  ensureCryptoReady,
  phraseToEntropy,
  deriveIdentityFromEntropy,
  generateSalt,
  deriveKEK,
  deriveVerifier,
  encryptPrivBlob,
  toBase64,
  fromBase64,
  zeroIdentity,
  zeroKEK,
  memzero,
} from '@/lib/crypto-client';
import { USERNAME_REGEX, PIN_REGEX } from '@cifra/shared';
import type { RecoverInitResponse, RecoverCompleteResponse } from '@cifra/shared';
import { useAppStore } from '@/store/useAppStore';

export default function RecoverPage() {
  const router = useRouter();
  const setSession = useAppStore((s) => s.setSession);
  const [username, setUsername] = useState('');
  const [phrase, setPhrase] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPin2, setNewPin2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!USERNAME_REGEX.test(username)) {
      setError('Username inválido');
      return;
    }
    if (!phrase.trim().split(/\s+/).every(Boolean) || phrase.trim().split(/\s+/).length !== 24) {
      setError('La frase debe tener exactamente 24 palabras');
      return;
    }
    if (!PIN_REGEX.test(newPin)) {
      setError('PIN: 6 a 12 dígitos');
      return;
    }
    if (newPin !== newPin2) {
      setError('Los PINs no coinciden');
      return;
    }

    setBusy(true);
    try {
      await ensureCryptoReady();
      const entropy = phraseToEntropy(phrase, 'es');
      const keys = deriveIdentityFromEntropy(entropy);
      memzero(entropy);

      const init = await api<RecoverInitResponse>('/auth/recover-init', {
        method: 'POST',
        body: { username },
        auth: false,
      });

      const challengeBytes = fromBase64(init.challenge);
      const signature = sodium.crypto_sign_detached(challengeBytes, keys.signing.privateKey);

      const pinSalt = generateSalt();
      const verifierSalt = generateSalt();
      const kek = deriveKEK(newPin, pinSalt);
      const verifier = deriveVerifier(newPin, verifierSalt);
      const blob = encryptPrivBlob(keys, kek);

      const res = await api<RecoverCompleteResponse>('/auth/recover-complete', {
        method: 'POST',
        body: {
          username,
          challenge: init.challenge,
          signature: toBase64(signature),
          newEncPrivBlob: blob.ciphertext,
          newEncPrivNonce: blob.nonce,
          newPinSalt: toBase64(pinSalt),
          newVerifierSalt: toBase64(verifierSalt),
          newPinVerifier: toBase64(verifier),
        },
        auth: false,
      });

      memzero(verifier);
      zeroKEK(kek);

      setTokens(res.tokens.accessToken, res.tokens.refreshToken);
      setSession({
        userId: res.userId,
        username,
        identityKeys: keys,
        accessToken: res.tokens.accessToken,
        refreshToken: res.tokens.refreshToken,
      });

      setNewPin('');
      setNewPin2('');
      setPhrase('');
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo recuperar la cuenta');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Recuperar cuenta</CardTitle>
          <CardDescription>
            Ingresá tu frase de 24 palabras y elegí un PIN nuevo. Las sesiones anteriores se cerrarán.
          </CardDescription>
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
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phrase">Frase de recuperación (24 palabras)</Label>
              <textarea
                id="phrase"
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value.toLowerCase())}
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPin">PIN nuevo</Label>
              <Input
                id="newPin"
                type="password"
                inputMode="numeric"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPin2">Repetir PIN</Label>
              <Input
                id="newPin2"
                type="password"
                inputMode="numeric"
                value={newPin2}
                onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, '').slice(0, 12))}
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              Recuperar
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
