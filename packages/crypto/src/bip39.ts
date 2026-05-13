import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic, generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { wordlist as spanishWordlist } from '@scure/bip39/wordlists/spanish';
import { memzero } from './memzero.js';
import { ensureReady } from './encoding.js';

export type Language = 'en' | 'es';

function pickWordlist(lang: Language): string[] {
  return lang === 'es' ? spanishWordlist : wordlist;
}

/**
 * Genera una frase BIP39 de 24 palabras (256 bits de entropía) en el idioma
 * elegido. La entropía la podemos derivar a las identity keys.
 */
export function generatePhrase(lang: Language = 'es'): string {
  return generateMnemonic(pickWordlist(lang), 256);
}

/**
 * Convierte 32 bytes de entropía en una frase BIP39 de 24 palabras.
 * Útil cuando ya tenés entropy generada por libsodium.
 */
export function entropyToPhrase(entropy: Uint8Array, lang: Language = 'es'): string {
  ensureReady();
  if (entropy.length !== 32) {
    throw new Error('Entropy must be 32 bytes for 24-word phrase');
  }
  return entropyToMnemonic(entropy, pickWordlist(lang));
}

/**
 * Convierte una frase BIP39 a sus 32 bytes de entropía. La validación de
 * checksum la hace @scure/bip39 internamente.
 */
export function phraseToEntropy(phrase: string, lang: Language = 'es'): Uint8Array {
  const cleaned = normalizePhrase(phrase);
  if (!validateMnemonic(cleaned, pickWordlist(lang))) {
    throw new Error('Invalid recovery phrase');
  }
  return mnemonicToEntropy(cleaned, pickWordlist(lang));
}

export function isValidPhrase(phrase: string, lang: Language = 'es'): boolean {
  try {
    const cleaned = normalizePhrase(phrase);
    return validateMnemonic(cleaned, pickWordlist(lang));
  } catch {
    return false;
  }
}

export function normalizePhrase(phrase: string): string {
  return phrase
    .normalize('NFKD')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

export function zeroPhraseFragments(...fragments: (string | undefined)[]): void {
  // strings en JS son inmutables: lo mejor que podemos hacer es desreferenciar
  // y ayudar al GC. Para material realmente sensible usamos Uint8Array.
  for (const f of fragments) {
    if (typeof f === 'string') {
      // no-op intencional, el caller debe perder la referencia
      void f;
    }
  }
}

export function zeroEntropy(entropy: Uint8Array): void {
  memzero(entropy);
}
