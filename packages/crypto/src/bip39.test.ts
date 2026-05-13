import { describe, it, expect, beforeAll } from 'vitest';
import {
  initCrypto,
  generateEntropy,
  deriveIdentityFromEntropy,
  entropyToPhrase,
  phraseToEntropy,
  isValidPhrase,
  generatePhrase,
  normalizePhrase,
} from './index.js';

beforeAll(async () => {
  await initCrypto();
});

describe('BIP39', () => {
  it('generates a 24-word phrase in spanish', () => {
    const phrase = generatePhrase('es');
    expect(phrase.split(' ').length).toBe(24);
  });

  it('generates a 24-word phrase in english', () => {
    const phrase = generatePhrase('en');
    expect(phrase.split(' ').length).toBe(24);
  });

  it('roundtrips entropy → phrase → entropy', () => {
    const entropy = generateEntropy();
    const phrase = entropyToPhrase(entropy, 'es');
    const restored = phraseToEntropy(phrase, 'es');
    expect(restored).toEqual(entropy);
  });

  it('produces the same identity from the same phrase (recovery use-case)', () => {
    const entropy = generateEntropy();
    const phrase = entropyToPhrase(entropy, 'es');
    const idA = deriveIdentityFromEntropy(entropy);
    const entropyAgain = phraseToEntropy(phrase, 'es');
    const idB = deriveIdentityFromEntropy(entropyAgain);
    expect(idA.identity.publicKey).toEqual(idB.identity.publicKey);
    expect(idA.signing.publicKey).toEqual(idB.signing.publicKey);
  });

  it('rejects invalid phrase', () => {
    expect(isValidPhrase('palabra palabra palabra', 'es')).toBe(false);
    expect(() => phraseToEntropy('not a real phrase at all here', 'es')).toThrow();
  });

  it('rejects phrase with valid words but wrong checksum', () => {
    const phrase = generatePhrase('es');
    const words = phrase.split(' ');
    words[23] = words[0]!;
    const tampered = words.join(' ');
    expect(isValidPhrase(tampered, 'es')).toBe(false);
  });

  it('normalizes whitespace and case', () => {
    expect(normalizePhrase('  Hola  Mundo  ')).toBe('hola mundo');
  });

  it('throws on entropy of wrong length', () => {
    expect(() => entropyToPhrase(new Uint8Array(16), 'es')).toThrow();
  });
});
