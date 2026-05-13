import sodium from 'libsodium-wrappers-sumo';
import {
  ensureReady,
  toBase64,
  fromBase64,
  randomBytes,
  utf8Encode,
} from './encoding.js';
import { memzero, memzeroAll } from './memzero.js';
import type { IdentityKeys } from './keypair.js';

/**
 * argon2id params para deriving KEK. Estos valores son los OWASP-recommended
 * minimums para 2024+. Suficientemente lentos para frenar offline brute-force
 * pero tolerables en CPUs de móviles modernos (~250ms en un teléfono medio).
 */
export const KEK_OPS = sodium.crypto_pwhash_OPSLIMIT_MODERATE;
export const KEK_MEM = sodium.crypto_pwhash_MEMLIMIT_MODERATE;
export const KEK_ALG = sodium.crypto_pwhash_ALG_ARGON2ID13;
export const SALT_BYTES = sodium.crypto_pwhash_SALTBYTES;
export const KEK_BYTES = sodium.crypto_secretbox_KEYBYTES;

export function generateSalt(): Uint8Array {
  return randomBytes(SALT_BYTES);
}

/**
 * Deriva la KEK (Key Encryption Key) desde el PIN del usuario via argon2id.
 * Esta KEK cifra el `encPrivBlob` que contiene las identity keys.
 * Nunca abandona el cliente.
 */
export function deriveKEK(pin: string, salt: Uint8Array): Uint8Array {
  ensureReady();
  if (typeof pin !== 'string' || pin.length === 0) {
    throw new Error('PIN must be a non-empty string');
  }
  if (salt.length !== SALT_BYTES) {
    throw new Error(`Salt must be ${SALT_BYTES} bytes`);
  }
  const kek = sodium.crypto_pwhash(
    KEK_BYTES,
    pin,
    salt,
    KEK_OPS,
    KEK_MEM,
    KEK_ALG
  );
  return kek;
}

/**
 * Verifier separado del KEK. Usa un salt distinto a propósito para que ni
 * siquiera con el verifier y el salt-KEK se pueda derivar el KEK.
 * El verifier va al server; el KEK nunca.
 */
export function deriveVerifier(pin: string, salt: Uint8Array): Uint8Array {
  ensureReady();
  if (salt.length !== SALT_BYTES) {
    throw new Error(`Verifier salt must be ${SALT_BYTES} bytes`);
  }
  return sodium.crypto_pwhash(
    32,
    pin,
    salt,
    KEK_OPS,
    KEK_MEM,
    KEK_ALG
  );
}

export interface EncryptedBlob {
  ciphertext: string;
  nonce: string;
}

/**
 * Cifra las identity keys (formato JSON serializado) con la KEK.
 * El blob resultante puede subirse al server: sin el PIN no se puede abrir.
 */
export function encryptPrivBlob(keys: IdentityKeys, kek: Uint8Array): EncryptedBlob {
  ensureReady();
  if (kek.length !== KEK_BYTES) {
    throw new Error(`KEK must be ${KEK_BYTES} bytes`);
  }
  const payload = JSON.stringify({
    v: 1,
    id_pk: toBase64(keys.identity.publicKey),
    id_sk: toBase64(keys.identity.privateKey),
    sg_pk: toBase64(keys.signing.publicKey),
    sg_sk: toBase64(keys.signing.privateKey),
  });
  const plaintext = utf8Encode(payload);
  const nonce = randomBytes(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(plaintext, nonce, kek);
  memzero(plaintext);
  return {
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
  };
}

export function decryptPrivBlob(blob: EncryptedBlob, kek: Uint8Array): IdentityKeys {
  ensureReady();
  if (kek.length !== KEK_BYTES) {
    throw new Error(`KEK must be ${KEK_BYTES} bytes`);
  }
  const ciphertext = fromBase64(blob.ciphertext);
  const nonce = fromBase64(blob.nonce);
  let plaintext: Uint8Array;
  try {
    plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, kek);
  } catch {
    throw new Error('Invalid PIN or corrupted blob');
  }
  const text = sodium.to_string(plaintext);
  let parsed: { id_pk: string; id_sk: string; sg_pk: string; sg_sk: string };
  try {
    parsed = JSON.parse(text);
  } finally {
    memzero(plaintext);
  }
  const result: IdentityKeys = {
    identity: {
      publicKey: fromBase64(parsed.id_pk),
      privateKey: fromBase64(parsed.id_sk),
    },
    signing: {
      publicKey: fromBase64(parsed.sg_pk),
      privateKey: fromBase64(parsed.sg_sk),
    },
  };
  return result;
}

export function zeroKEK(kek: Uint8Array): void {
  memzero(kek);
}

export function zeroVerifier(verifier: Uint8Array): void {
  memzeroAll(verifier);
}
