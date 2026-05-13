'use client';

import sodium from 'libsodium-wrappers-sumo';
import { ensureCryptoReady, toBase64, fromBase64, type IdentityKeys } from './crypto-client';

const SCHEME = 'cifra:v1:contact';

export interface ContactCard {
  v: 1;
  u: string; // username
  d: string; // display name
  ip: string; // identityPub
  sp: string; // signingPub
  sig: string; // Ed25519 signature over canonical(v, u, d, ip, sp)
}

function canonicalBytes(card: Omit<ContactCard, 'sig'>): Uint8Array {
  const payload = `${SCHEME}|${card.v}|${card.u}|${card.d}|${card.ip}|${card.sp}`;
  return sodium.from_string(payload);
}

export async function createSignedCard(
  username: string,
  displayName: string,
  keys: IdentityKeys
): Promise<ContactCard> {
  await ensureCryptoReady();
  const base: Omit<ContactCard, 'sig'> = {
    v: 1,
    u: username,
    d: displayName,
    ip: toBase64(keys.identity.publicKey),
    sp: toBase64(keys.signing.publicKey),
  };
  const signature = sodium.crypto_sign_detached(canonicalBytes(base), keys.signing.privateKey);
  return { ...base, sig: toBase64(signature) };
}

export async function verifyAndParseCard(serialized: string): Promise<ContactCard | null> {
  try {
    await ensureCryptoReady();
    const parsed = JSON.parse(serialized) as ContactCard;
    if (parsed.v !== 1) return null;
    if (typeof parsed.u !== 'string' || typeof parsed.d !== 'string') return null;
    if (typeof parsed.ip !== 'string' || typeof parsed.sp !== 'string') return null;
    if (typeof parsed.sig !== 'string') return null;
    const signingPub = fromBase64(parsed.sp);
    const signature = fromBase64(parsed.sig);
    const ok = sodium.crypto_sign_verify_detached(
      signature,
      canonicalBytes(parsed),
      signingPub
    );
    return ok ? parsed : null;
  } catch {
    return null;
  }
}

export function serializeCard(card: ContactCard): string {
  return JSON.stringify(card);
}
