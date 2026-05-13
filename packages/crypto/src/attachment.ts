import sodium from 'libsodium-wrappers-sumo';
import { ensureReady, toBase64, fromBase64, randomBytes } from './encoding.js';
import { memzero, memzeroAll } from './memzero.js';

const FILE_KEY_BYTES = sodium.crypto_secretstream_xchacha20poly1305_KEYBYTES;
const FILE_HEADER_BYTES = sodium.crypto_secretstream_xchacha20poly1305_HEADERBYTES;

export interface EncryptedAttachment {
  ciphertext: Uint8Array;
  wrappedKey: string;
  nonce: string;
}

/**
 * Cifra un archivo con key simétrica random, luego envuelve la fileKey con
 * crypto_box hacia la identityPub del recipient. El server solo ve ciphertext.
 */
export function encryptAttachment(
  plaintext: Uint8Array,
  recipientIdentityPub: Uint8Array,
  senderIdentityPriv: Uint8Array
): EncryptedAttachment {
  ensureReady();

  const fileKey = randomBytes(FILE_KEY_BYTES);
  const stream = sodium.crypto_secretstream_xchacha20poly1305_init_push(fileKey);
  const ciphertext = sodium.crypto_secretstream_xchacha20poly1305_push(
    stream.state,
    plaintext,
    null,
    sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
  );
  const full = new Uint8Array(stream.header.length + ciphertext.length);
  full.set(stream.header, 0);
  full.set(ciphertext, stream.header.length);

  const nonce = randomBytes(sodium.crypto_box_NONCEBYTES);
  const wrappedKey = sodium.crypto_box_easy(
    fileKey,
    nonce,
    recipientIdentityPub,
    senderIdentityPriv
  );

  memzero(fileKey);

  return {
    ciphertext: full,
    wrappedKey: toBase64(wrappedKey),
    nonce: toBase64(nonce),
  };
}

export function decryptAttachment(
  ciphertext: Uint8Array,
  wrappedKey: string,
  nonce: string,
  senderIdentityPub: Uint8Array,
  recipientIdentityPriv: Uint8Array
): Uint8Array {
  ensureReady();

  const wrapped = fromBase64(wrappedKey);
  const nonceBytes = fromBase64(nonce);
  let fileKey: Uint8Array;
  try {
    fileKey = sodium.crypto_box_open_easy(
      wrapped,
      nonceBytes,
      senderIdentityPub,
      recipientIdentityPriv
    );
  } catch {
    throw new Error('Failed to unwrap attachment key');
  }
  if (fileKey.length !== FILE_KEY_BYTES) {
    memzero(fileKey);
    throw new Error('Invalid attachment key length');
  }

  if (ciphertext.length < FILE_HEADER_BYTES) {
    memzero(fileKey);
    throw new Error('Attachment ciphertext too short');
  }
  const header = ciphertext.slice(0, FILE_HEADER_BYTES);
  const body = ciphertext.slice(FILE_HEADER_BYTES);

  const state = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, fileKey);
  const result = sodium.crypto_secretstream_xchacha20poly1305_pull(state, body, null);
  if (!result) {
    memzeroAll(fileKey);
    throw new Error('Failed to decrypt attachment');
  }
  memzero(fileKey);
  return result.message;
}
