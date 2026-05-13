export {
  initCrypto,
  ensureReady,
  toBase64,
  fromBase64,
  toHex,
  fromHex,
  utf8Encode,
  utf8Decode,
  randomBytes,
  memcmp,
} from './encoding.js';

export { memzero, memzeroAll } from './memzero.js';

export {
  ENTROPY_BYTES,
  deriveIdentityFromEntropy,
  generateEntropy,
  serializeIdentity,
  deserializeIdentity,
  zeroIdentity,
  safetyNumber,
} from './keypair.js';
export type {
  IdentityKeys,
  KeyPairBytes,
  SerializedIdentity,
  SerializedKeyPair,
} from './keypair.js';

export {
  KEK_BYTES,
  SALT_BYTES,
  generateSalt,
  deriveKEK,
  deriveVerifier,
  encryptPrivBlob,
  decryptPrivBlob,
  zeroKEK,
  zeroVerifier,
} from './kek.js';
export type { EncryptedBlob } from './kek.js';

export {
  encryptMessage,
  decryptMessage,
} from './message.js';
export type { EncryptedMessage, EncryptParams, DecryptParams } from './message.js';

export {
  encryptAttachment,
  decryptAttachment,
} from './attachment.js';
export type { EncryptedAttachment } from './attachment.js';

export {
  generatePhrase,
  entropyToPhrase,
  phraseToEntropy,
  isValidPhrase,
  normalizePhrase,
  zeroPhraseFragments,
  zeroEntropy,
} from './bip39.js';
export type { Language } from './bip39.js';
