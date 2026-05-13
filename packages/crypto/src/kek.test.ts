import { describe, it, expect, beforeAll } from 'vitest';
import {
  initCrypto,
  deriveKEK,
  deriveVerifier,
  generateSalt,
  generateEntropy,
  deriveIdentityFromEntropy,
  encryptPrivBlob,
  decryptPrivBlob,
  KEK_BYTES,
  SALT_BYTES,
} from './index.js';

beforeAll(async () => {
  await initCrypto();
}, 60_000);

describe('KEK derivation', () => {
  it('produces a key of correct length', () => {
    const salt = generateSalt();
    expect(salt.length).toBe(SALT_BYTES);
    const kek = deriveKEK('123456', salt);
    expect(kek.length).toBe(KEK_BYTES);
  }, 30_000);

  it('is deterministic given same pin + salt', () => {
    const salt = generateSalt();
    const k1 = deriveKEK('correct_horse_battery_staple', salt);
    const k2 = deriveKEK('correct_horse_battery_staple', salt);
    expect(k1).toEqual(k2);
  }, 60_000);

  it('differs when PIN differs', () => {
    const salt = generateSalt();
    const k1 = deriveKEK('123456', salt);
    const k2 = deriveKEK('123457', salt);
    expect(k1).not.toEqual(k2);
  }, 60_000);

  it('differs when salt differs', () => {
    const k1 = deriveKEK('123456', generateSalt());
    const k2 = deriveKEK('123456', generateSalt());
    expect(k1).not.toEqual(k2);
  }, 60_000);

  it('verifier uses a different salt and produces different output', () => {
    const kekSalt = generateSalt();
    const verSalt = generateSalt();
    const kek = deriveKEK('123456', kekSalt);
    const ver = deriveVerifier('123456', verSalt);
    expect(kek).not.toEqual(ver);
  }, 60_000);
});

describe('encPrivBlob roundtrip', () => {
  it('encrypts and decrypts identity keys with KEK', () => {
    const entropy = generateEntropy();
    const keys = deriveIdentityFromEntropy(entropy);
    const salt = generateSalt();
    const kek = deriveKEK('123456', salt);

    const blob = encryptPrivBlob(keys, kek);
    expect(blob.ciphertext).toBeTruthy();
    expect(blob.nonce).toBeTruthy();

    const restored = decryptPrivBlob(blob, kek);
    expect(restored.identity.publicKey).toEqual(keys.identity.publicKey);
    expect(restored.identity.privateKey).toEqual(keys.identity.privateKey);
    expect(restored.signing.publicKey).toEqual(keys.signing.publicKey);
    expect(restored.signing.privateKey).toEqual(keys.signing.privateKey);
  }, 60_000);

  it('fails to decrypt with wrong KEK', () => {
    const entropy = generateEntropy();
    const keys = deriveIdentityFromEntropy(entropy);
    const salt = generateSalt();
    const goodKek = deriveKEK('123456', salt);
    const badKek = deriveKEK('123457', salt);

    const blob = encryptPrivBlob(keys, goodKek);
    expect(() => decryptPrivBlob(blob, badKek)).toThrow();
  }, 60_000);
});
