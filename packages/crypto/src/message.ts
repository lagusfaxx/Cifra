import sodium from 'libsodium-wrappers-sumo';
import {
  ensureReady,
  toBase64,
  fromBase64,
  randomBytes,
  utf8Encode,
  utf8Decode,
} from './encoding.js';
import { memzero, memzeroAll } from './memzero.js';

export interface EncryptedMessage {
  ciphertext: string;
  nonce: string;
  ephemeralPub: string;
  signature: string;
}

const MSG_KEY_BYTES = sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES;
const MSG_NONCE_BYTES = sodium.crypto_aead_xchacha20poly1305_ietf_NONCEBYTES;
const HKDF_INFO_PREFIX = 'cifra-msg-v1';

/**
 * HKDF-SHA256 vía libsodium kdf. salt + info determinan el binding al
 * contexto de la conversación.
 */
function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Uint8Array {
  ensureReady();
  const prk = sodium.crypto_auth_hmacsha256(ikm, salt);
  const blocks = Math.ceil(length / 32);
  if (blocks > 255) throw new Error('HKDF output too long');
  const out = new Uint8Array(blocks * 32);
  let prev = new Uint8Array(0);
  for (let i = 1; i <= blocks; i++) {
    const buf = new Uint8Array(prev.length + info.length + 1);
    buf.set(prev, 0);
    buf.set(info, prev.length);
    buf[prev.length + info.length] = i;
    const block = sodium.crypto_auth_hmacsha256(buf, prk);
    out.set(block, (i - 1) * 32);
    prev = block;
  }
  memzero(prk);
  return out.slice(0, length);
}

function deriveMessageKey(
  ephemeralPriv: Uint8Array,
  recipientIdentityPub: Uint8Array,
  conversationId: string
): Uint8Array {
  ensureReady();
  const shared = sodium.crypto_scalarmult(ephemeralPriv, recipientIdentityPub);
  const salt = utf8Encode(HKDF_INFO_PREFIX);
  const info = utf8Encode(`conv:${conversationId}`);
  const key = hkdf(shared, salt, info, MSG_KEY_BYTES);
  memzero(shared);
  return key;
}

function deriveMessageKeyForRecipient(
  recipientIdentityPriv: Uint8Array,
  ephemeralPub: Uint8Array,
  conversationId: string
): Uint8Array {
  ensureReady();
  const shared = sodium.crypto_scalarmult(recipientIdentityPriv, ephemeralPub);
  const salt = utf8Encode(HKDF_INFO_PREFIX);
  const info = utf8Encode(`conv:${conversationId}`);
  const key = hkdf(shared, salt, info, MSG_KEY_BYTES);
  memzero(shared);
  return key;
}

export interface EncryptParams {
  plaintext: string;
  recipientIdentityPub: Uint8Array;
  senderSigningPriv: Uint8Array;
  conversationId: string;
  associatedData?: Uint8Array;
}

export interface DecryptParams {
  message: EncryptedMessage;
  recipientIdentityPriv: Uint8Array;
  senderSigningPub: Uint8Array;
  conversationId: string;
  associatedData?: Uint8Array;
}

/**
 * Cifrado v1: ECIES con ephemeral X25519 + XChaCha20-Poly1305 AEAD + Ed25519
 * signature. Forward secrecy parcial (ephemeral key por mensaje), AEAD
 * garantiza integridad, signature garantiza autoría.
 */
export function encryptMessage(p: EncryptParams): EncryptedMessage {
  ensureReady();

  const ephKp = sodium.crypto_box_keypair();
  const msgKey = deriveMessageKey(
    ephKp.privateKey,
    p.recipientIdentityPub,
    p.conversationId
  );
  const nonce = randomBytes(MSG_NONCE_BYTES);
  const plaintextBytes = utf8Encode(p.plaintext);
  const ad = p.associatedData ?? new Uint8Array(0);

  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintextBytes,
    ad,
    null,
    nonce,
    msgKey
  );

  const sigInput = new Uint8Array(ciphertext.length + nonce.length + ephKp.publicKey.length);
  sigInput.set(ciphertext, 0);
  sigInput.set(nonce, ciphertext.length);
  sigInput.set(ephKp.publicKey, ciphertext.length + nonce.length);
  const signature = sodium.crypto_sign_detached(sigInput, p.senderSigningPriv);

  const result: EncryptedMessage = {
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
    ephemeralPub: toBase64(ephKp.publicKey),
    signature: toBase64(signature),
  };

  memzeroAll(ephKp.privateKey, msgKey, plaintextBytes, sigInput);
  return result;
}

export function decryptMessage(p: DecryptParams): string {
  ensureReady();

  const ciphertext = fromBase64(p.message.ciphertext);
  const nonce = fromBase64(p.message.nonce);
  const ephemeralPub = fromBase64(p.message.ephemeralPub);
  const signature = fromBase64(p.message.signature);

  const sigInput = new Uint8Array(ciphertext.length + nonce.length + ephemeralPub.length);
  sigInput.set(ciphertext, 0);
  sigInput.set(nonce, ciphertext.length);
  sigInput.set(ephemeralPub, ciphertext.length + nonce.length);

  const sigOk = sodium.crypto_sign_verify_detached(signature, sigInput, p.senderSigningPub);
  if (!sigOk) {
    memzero(sigInput);
    throw new Error('Invalid message signature');
  }

  const msgKey = deriveMessageKeyForRecipient(
    p.recipientIdentityPriv,
    ephemeralPub,
    p.conversationId
  );
  const ad = p.associatedData ?? new Uint8Array(0);

  let plaintext: Uint8Array;
  try {
    plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      ad,
      nonce,
      msgKey
    );
  } catch {
    memzeroAll(sigInput, msgKey);
    throw new Error('Failed to decrypt message');
  }

  const text = utf8Decode(plaintext);
  memzeroAll(plaintext, msgKey, sigInput);
  return text;
}
