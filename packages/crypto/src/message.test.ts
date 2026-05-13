import { describe, it, expect, beforeAll } from 'vitest';
import {
  initCrypto,
  generateEntropy,
  deriveIdentityFromEntropy,
  encryptMessage,
  decryptMessage,
} from './index.js';

beforeAll(async () => {
  await initCrypto();
});

describe('message encryption roundtrip', () => {
  it('encrypts and decrypts a plaintext message', () => {
    const alice = deriveIdentityFromEntropy(generateEntropy());
    const bob = deriveIdentityFromEntropy(generateEntropy());

    const plaintext = 'Reunión confidencial a las 18:00 en el café.';
    const enc = encryptMessage({
      plaintext,
      recipientIdentityPub: bob.identity.publicKey,
      senderSigningPriv: alice.signing.privateKey,
      conversationId: 'conv-abc',
    });

    expect(enc.ciphertext).toBeTruthy();
    expect(enc.nonce).toBeTruthy();
    expect(enc.ephemeralPub).toBeTruthy();
    expect(enc.signature).toBeTruthy();

    const decoded = decryptMessage({
      message: enc,
      recipientIdentityPriv: bob.identity.privateKey,
      senderSigningPub: alice.signing.publicKey,
      conversationId: 'conv-abc',
    });

    expect(decoded).toBe(plaintext);
  });

  it('produces a different ciphertext for the same plaintext (ephemeral randomness)', () => {
    const alice = deriveIdentityFromEntropy(generateEntropy());
    const bob = deriveIdentityFromEntropy(generateEntropy());
    const params = {
      plaintext: 'mismo mensaje',
      recipientIdentityPub: bob.identity.publicKey,
      senderSigningPriv: alice.signing.privateKey,
      conversationId: 'c1',
    };
    const e1 = encryptMessage(params);
    const e2 = encryptMessage(params);
    expect(e1.ciphertext).not.toBe(e2.ciphertext);
    expect(e1.ephemeralPub).not.toBe(e2.ephemeralPub);
  });

  it('rejects message with tampered ciphertext', () => {
    const alice = deriveIdentityFromEntropy(generateEntropy());
    const bob = deriveIdentityFromEntropy(generateEntropy());
    const enc = encryptMessage({
      plaintext: 'no toques',
      recipientIdentityPub: bob.identity.publicKey,
      senderSigningPriv: alice.signing.privateKey,
      conversationId: 'c1',
    });
    const tampered = { ...enc, ciphertext: flipFirstChar(enc.ciphertext) };
    expect(() =>
      decryptMessage({
        message: tampered,
        recipientIdentityPriv: bob.identity.privateKey,
        senderSigningPub: alice.signing.publicKey,
        conversationId: 'c1',
      })
    ).toThrow();
  });

  it('rejects message with wrong signing pub', () => {
    const alice = deriveIdentityFromEntropy(generateEntropy());
    const eve = deriveIdentityFromEntropy(generateEntropy());
    const bob = deriveIdentityFromEntropy(generateEntropy());
    const enc = encryptMessage({
      plaintext: 'soy alice',
      recipientIdentityPub: bob.identity.publicKey,
      senderSigningPriv: alice.signing.privateKey,
      conversationId: 'c1',
    });
    expect(() =>
      decryptMessage({
        message: enc,
        recipientIdentityPriv: bob.identity.privateKey,
        senderSigningPub: eve.signing.publicKey,
        conversationId: 'c1',
      })
    ).toThrow(/signature/i);
  });

  it('rejects message decrypted by wrong recipient', () => {
    const alice = deriveIdentityFromEntropy(generateEntropy());
    const bob = deriveIdentityFromEntropy(generateEntropy());
    const eve = deriveIdentityFromEntropy(generateEntropy());
    const enc = encryptMessage({
      plaintext: 'para bob',
      recipientIdentityPub: bob.identity.publicKey,
      senderSigningPriv: alice.signing.privateKey,
      conversationId: 'c1',
    });
    expect(() =>
      decryptMessage({
        message: enc,
        recipientIdentityPriv: eve.identity.privateKey,
        senderSigningPub: alice.signing.publicKey,
        conversationId: 'c1',
      })
    ).toThrow();
  });

  it('rejects message with wrong conversationId (HKDF binding)', () => {
    const alice = deriveIdentityFromEntropy(generateEntropy());
    const bob = deriveIdentityFromEntropy(generateEntropy());
    const enc = encryptMessage({
      plaintext: 'bound to conv',
      recipientIdentityPub: bob.identity.publicKey,
      senderSigningPriv: alice.signing.privateKey,
      conversationId: 'conv-A',
    });
    expect(() =>
      decryptMessage({
        message: enc,
        recipientIdentityPriv: bob.identity.privateKey,
        senderSigningPub: alice.signing.publicKey,
        conversationId: 'conv-B',
      })
    ).toThrow();
  });
});

function flipFirstChar(b64: string): string {
  const first = b64[0]!;
  const replacement = first === 'A' ? 'B' : 'A';
  return replacement + b64.slice(1);
}
