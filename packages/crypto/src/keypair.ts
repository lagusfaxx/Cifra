import sodium from 'libsodium-wrappers-sumo';
import { ensureReady, toBase64, fromBase64, randomBytes } from './encoding.js';
import { memzeroAll } from './memzero.js';

export interface KeyPairBytes {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface IdentityKeys {
  identity: KeyPairBytes;
  signing: KeyPairBytes;
}

export interface SerializedKeyPair {
  publicKey: string;
  privateKey: string;
}

export interface SerializedIdentity {
  identity: SerializedKeyPair;
  signing: SerializedKeyPair;
}

export const ENTROPY_BYTES = 32;

/**
 * Deriva un par X25519 (encryption) y un par Ed25519 (signing) determinísticamente
 * a partir de 32 bytes de entropía. Esto permite que la frase BIP39 regenere las
 * mismas keys en otro device.
 */
export function deriveIdentityFromEntropy(entropy: Uint8Array): IdentityKeys {
  ensureReady();
  if (entropy.length !== ENTROPY_BYTES) {
    throw new Error(`Entropy must be ${ENTROPY_BYTES} bytes, got ${entropy.length}`);
  }

  const identitySeed = sodium.crypto_generichash(
    sodium.crypto_box_SEEDBYTES,
    entropy,
    sodium.from_string('cifra-id-x25519-v1')
  );
  const signingSeed = sodium.crypto_generichash(
    sodium.crypto_sign_SEEDBYTES,
    entropy,
    sodium.from_string('cifra-id-ed25519-v1')
  );

  const idKp = sodium.crypto_box_seed_keypair(identitySeed);
  const signKp = sodium.crypto_sign_seed_keypair(signingSeed);

  memzeroAll(identitySeed, signingSeed);

  return {
    identity: { publicKey: idKp.publicKey, privateKey: idKp.privateKey },
    signing: { publicKey: signKp.publicKey, privateKey: signKp.privateKey },
  };
}

export function generateEntropy(): Uint8Array {
  return randomBytes(ENTROPY_BYTES);
}

export function serializeIdentity(keys: IdentityKeys): SerializedIdentity {
  return {
    identity: {
      publicKey: toBase64(keys.identity.publicKey),
      privateKey: toBase64(keys.identity.privateKey),
    },
    signing: {
      publicKey: toBase64(keys.signing.publicKey),
      privateKey: toBase64(keys.signing.privateKey),
    },
  };
}

export function deserializeIdentity(s: SerializedIdentity): IdentityKeys {
  return {
    identity: {
      publicKey: fromBase64(s.identity.publicKey),
      privateKey: fromBase64(s.identity.privateKey),
    },
    signing: {
      publicKey: fromBase64(s.signing.publicKey),
      privateKey: fromBase64(s.signing.privateKey),
    },
  };
}

export function zeroIdentity(keys: IdentityKeys): void {
  memzeroAll(
    keys.identity.privateKey,
    keys.identity.publicKey,
    keys.signing.privateKey,
    keys.signing.publicKey
  );
}

/**
 * Genera un fingerprint de 64 caracteres hex para que dos usuarios verifiquen
 * en persona que tienen las mismas pubkeys (safety number).
 */
export function safetyNumber(
  identityPubA: Uint8Array,
  identityPubB: Uint8Array
): string {
  ensureReady();
  const sorted = compareBytes(identityPubA, identityPubB) <= 0
    ? [identityPubA, identityPubB]
    : [identityPubB, identityPubA];
  const concat = new Uint8Array(sorted[0]!.length + sorted[1]!.length);
  concat.set(sorted[0]!, 0);
  concat.set(sorted[1]!, sorted[0]!.length);
  const digest = sodium.crypto_generichash(32, concat, sodium.from_string('cifra-safety-v1'));
  return sodium.to_hex(digest);
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    if (av !== bv) return av - bv;
  }
  return a.length - b.length;
}
