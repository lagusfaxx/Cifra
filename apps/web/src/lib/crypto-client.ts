'use client';

import {
  initCrypto,
  deriveIdentityFromEntropy,
  generateEntropy,
  generateSalt,
  deriveKEK,
  deriveVerifier,
  encryptPrivBlob,
  decryptPrivBlob,
  entropyToPhrase,
  phraseToEntropy,
  encryptMessage,
  decryptMessage,
  encryptAttachment,
  decryptAttachment,
  serializeIdentity,
  deserializeIdentity,
  toBase64,
  fromBase64,
  safetyNumber,
  zeroIdentity,
  zeroKEK,
  memzero,
  randomBytes,
  type Language,
  type IdentityKeys,
} from '@cifra/crypto';

let initialized = false;

export async function ensureCryptoReady(): Promise<void> {
  if (initialized) return;
  await initCrypto();
  initialized = true;
}

export {
  deriveIdentityFromEntropy,
  generateEntropy,
  generateSalt,
  deriveKEK,
  deriveVerifier,
  encryptPrivBlob,
  decryptPrivBlob,
  entropyToPhrase,
  phraseToEntropy,
  encryptMessage,
  decryptMessage,
  encryptAttachment,
  decryptAttachment,
  serializeIdentity,
  deserializeIdentity,
  toBase64,
  fromBase64,
  safetyNumber,
  zeroIdentity,
  zeroKEK,
  memzero,
  randomBytes,
};
export type { Language, IdentityKeys };
