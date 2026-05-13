'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RecoveryPhraseDisplay } from '@/components/RecoveryPhraseDisplay';
import { api, setTokens, ApiError } from '@/lib/api';
import {
  ensureCryptoReady,
  generateEntropy,
  entropyToPhrase,
  deriveIdentityFromEntropy,
  generateSalt,
  deriveKEK,
  deriveVerifier,
  encryptPrivBlob,
  toBase64,
  memzero,
  zeroIdentity,
  zeroKEK,
} from '@/lib/crypto-client';
import { isDisposableEmail, USERNAME_REGEX, PIN_REGEX } from '@cifra/shared';
import type { SignupInitResponse, SignupVerifyResponse, SignupCompleteResponse } from '@cifra/shared';
import { useAppStore } from '@/store/useAppStore';

type Step = 'identity' | 'code' | 'pin' | 'phrase' | 'done';

export default function SignupPage() {
  const router = useRouter();
  const setSession = useAppStore((s) => s.setSession);

  const [step, setStep] = useState<Step>('identity');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [phrase, setPhrase] = useState('');
  const [generatedKeys, setGeneratedKeys] = useState<{
    encPrivBlob: string;
    encPrivNonce: string;
    pinSalt: string;
    verifierSalt: string;
    pinVerifier: string;
    identityPub: string;
    signingPub: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitIdentity(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!USERNAME_REGEX.test(username)) {
      setError('Username debe ser 3-20 chars, solo a-z 0-9 _');
      return;
    }
    if (!displayName.trim() || displayName.length > 30) {
      setError('Nombre visible obligatorio (máx 30 chars)');
      return;
    }
    if (isDisposableEmail(email)) {
      setError('No se aceptan emails desechables');
      return;
    }
    setBusy(true);
    try {
      const res = await api<SignupInitResponse>('/auth/signup-init', {
        method: 'POST',
        body: { username, email },
        auth: false,
      });
      setVerificationToken(res.verificationToken);
      setStep('code');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al iniciar registro');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError('Código de 6 dígitos');
      return;
    }
    setBusy(true);
    try {
      const res = await api<SignupVerifyResponse>('/auth/signup-verify', {
        method: 'POST',
        body: { username, code },
        auth: false,
      });
      setVerificationToken(res.verificationToken);
      setStep('pin');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Código inválido');
    } finally {
      setBusy(false);
    }
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!PIN_REGEX.test(pin)) {
      setError('PIN: 6 a 12 dígitos');
      return;
    }
    if (pin !== pin2) {
      setError('Los PINs no coinciden');
      return;
    }
    setBusy(true);
    try {
      await ensureCryptoReady();
      const entropy = generateEntropy();
      const phraseStr = entropyToPhrase(entropy, 'es');
      const keys = deriveIdentityFromEntropy(entropy);
      const pinSalt = generateSalt();
      const verifierSalt = generateSalt();
      const kek = deriveKEK(pin, pinSalt);
      const verifier = deriveVerifier(pin, verifierSalt);
      const blob = encryptPrivBlob(keys, kek);

      setGeneratedKeys({
        encPrivBlob: blob.ciphertext,
        encPrivNonce: blob.nonce,
        pinSalt: toBase64(pinSalt),
        verifierSalt: toBase64(verifierSalt),
        pinVerifier: toBase64(verifier),
        identityPub: toBase64(keys.identity.publicKey),
        signingPub: toBase64(keys.signing.publicKey),
      });
      setPhrase(phraseStr);
      memzero(entropy);
      memzero(verifier);
      zeroKEK(kek);
      zeroIdentity(keys);
      setStep('phrase');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generando claves');
    } finally {
      setBusy(false);
    }
  }

  async function confirmPhraseAndSubmit() {
    if (!generatedKeys) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<SignupCompleteResponse>('/auth/signup-complete', {
        method: 'POST',
        body: {
          username,
          verificationToken,
          displayName,
          ...generatedKeys,
        },
        auth: false,
      });
      setTokens(res.tokens.accessToken, res.tokens.refreshToken);
      setSession({
        userId: res.userId,
        username,
        displayName,
        accessToken: res.tokens.accessToken,
        refreshToken: res.tokens.refreshToken,
      });
      setPin('');
      setPin2('');
      setPhrase('');
      setStep('done');
      router.replace('/onboarding');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error completando registro');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Crear cuenta</CardTitle>
          <CardDescription>
            Sin teléfono, sin nombre real. Solo username, email para verificar, y PIN.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {step === 'identity' && (
            <form onSubmit={submitIdentity} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="alcalde_2024"
                />
                <p className="text-xs text-muted-foreground">3-20 chars, a-z 0-9 _</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Nombre visible</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Cómo querés que te vean (puede ser ficticio)"
                  maxLength={30}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                  placeholder="solo para verificar — no se guarda en claro"
                />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                Enviar código
              </Button>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={submitCode} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Código de verificación</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6 dígitos enviados al email"
                  maxLength={6}
                />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                Verificar
              </Button>
            </form>
          )}

          {step === 'pin' && (
            <form onSubmit={submitPin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pin">PIN (6-12 dígitos)</Label>
                <Input
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  El PIN nunca llega al servidor. Sin el PIN no se pueden descifrar tus mensajes.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin2">Repetir PIN</Label>
                <Input
                  id="pin2"
                  type="password"
                  inputMode="numeric"
                  value={pin2}
                  onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" disabled={busy} className="w-full">
                Crear claves
              </Button>
            </form>
          )}

          {step === 'phrase' && phrase && (
            <RecoveryPhraseDisplay phrase={phrase} onConfirm={() => void confirmPhraseAndSubmit()} />
          )}

          {step === 'done' && <div className="text-sm">Cuenta creada. Redirigiendo…</div>}
        </CardContent>
      </Card>
    </main>
  );
}
