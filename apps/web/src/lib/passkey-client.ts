'use client';

import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { api } from './api';

export async function registerPasskey(deviceName?: string): Promise<void> {
  const options = await api<unknown>('/auth/passkey/register/start', {
    method: 'POST',
    body: {},
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attestation = await startRegistration(options as any);
  await api('/auth/passkey/register/finish', {
    method: 'POST',
    body: { attestationResponse: attestation, deviceName: deviceName ?? null },
  });
}

export async function authenticateWithPasskey(
  username: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}> {
  const options = await api<unknown>('/auth/passkey/auth/start', {
    method: 'POST',
    body: { username },
    auth: false,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assertion = await startAuthentication(options as any);
  const res = await api<{
    tokens: { accessToken: string; refreshToken: string; expiresAt: number };
  }>('/auth/passkey/auth/finish', {
    method: 'POST',
    body: { username, assertionResponse: assertion },
    auth: false,
  });
  return res.tokens;
}
