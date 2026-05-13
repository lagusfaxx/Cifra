import { describe, it, expect, beforeAll } from 'vitest';
import {
  initCrypto,
  generateEntropy,
  deriveIdentityFromEntropy,
  serializeIdentity,
  deserializeIdentity,
  safetyNumber,
  ENTROPY_BYTES,
} from './index.js';

beforeAll(async () => {
  await initCrypto();
});

describe('keypair', () => {
  it('generates entropy of correct length', () => {
    const e = generateEntropy();
    expect(e.length).toBe(ENTROPY_BYTES);
  });

  it('derives the same keys from the same entropy (deterministic)', () => {
    const entropy = generateEntropy();
    const a = deriveIdentityFromEntropy(entropy);
    const b = deriveIdentityFromEntropy(entropy);
    expect(a.identity.publicKey).toEqual(b.identity.publicKey);
    expect(a.identity.privateKey).toEqual(b.identity.privateKey);
    expect(a.signing.publicKey).toEqual(b.signing.publicKey);
    expect(a.signing.privateKey).toEqual(b.signing.privateKey);
  });

  it('produces different keys from different entropy', () => {
    const a = deriveIdentityFromEntropy(generateEntropy());
    const b = deriveIdentityFromEntropy(generateEntropy());
    expect(a.identity.publicKey).not.toEqual(b.identity.publicKey);
  });

  it('roundtrips serialize/deserialize', () => {
    const original = deriveIdentityFromEntropy(generateEntropy());
    const s = serializeIdentity(original);
    const restored = deserializeIdentity(s);
    expect(restored.identity.publicKey).toEqual(original.identity.publicKey);
    expect(restored.identity.privateKey).toEqual(original.identity.privateKey);
    expect(restored.signing.publicKey).toEqual(original.signing.publicKey);
    expect(restored.signing.privateKey).toEqual(original.signing.privateKey);
  });

  it('rejects entropy of wrong length', () => {
    expect(() => deriveIdentityFromEntropy(new Uint8Array(16))).toThrow();
    expect(() => deriveIdentityFromEntropy(new Uint8Array(64))).toThrow();
  });

  it('safety number is commutative', () => {
    const a = deriveIdentityFromEntropy(generateEntropy()).identity.publicKey;
    const b = deriveIdentityFromEntropy(generateEntropy()).identity.publicKey;
    expect(safetyNumber(a, b)).toBe(safetyNumber(b, a));
  });

  it('safety number changes if either key changes', () => {
    const a = deriveIdentityFromEntropy(generateEntropy()).identity.publicKey;
    const b = deriveIdentityFromEntropy(generateEntropy()).identity.publicKey;
    const c = deriveIdentityFromEntropy(generateEntropy()).identity.publicKey;
    expect(safetyNumber(a, b)).not.toBe(safetyNumber(a, c));
  });
});
