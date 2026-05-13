import sodium from 'libsodium-wrappers-sumo';

let ready = false;

export async function initCrypto(): Promise<void> {
  if (ready) return;
  await sodium.ready;
  ready = true;
}

export function ensureReady(): void {
  if (!ready) {
    throw new Error('Crypto not initialized. Call initCrypto() first.');
  }
}

export function toBase64(bytes: Uint8Array): string {
  ensureReady();
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}

export function fromBase64(b64: string): Uint8Array {
  ensureReady();
  return sodium.from_base64(b64, sodium.base64_variants.ORIGINAL);
}

export function toHex(bytes: Uint8Array): string {
  ensureReady();
  return sodium.to_hex(bytes);
}

export function fromHex(hex: string): Uint8Array {
  ensureReady();
  return sodium.from_hex(hex);
}

export function utf8Encode(text: string): Uint8Array {
  ensureReady();
  return sodium.from_string(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  ensureReady();
  return sodium.to_string(bytes);
}

export function randomBytes(length: number): Uint8Array {
  ensureReady();
  if (length <= 0 || !Number.isInteger(length)) {
    throw new Error('Invalid random length');
  }
  return sodium.randombytes_buf(length);
}

export function memcmp(a: Uint8Array, b: Uint8Array): boolean {
  ensureReady();
  if (a.length !== b.length) return false;
  return sodium.memcmp(a, b);
}
