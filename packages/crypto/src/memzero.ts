import sodium from 'libsodium-wrappers-sumo';
import { ensureReady } from './encoding.js';

export function memzero(buf: Uint8Array): void {
  ensureReady();
  sodium.memzero(buf);
}

export function memzeroAll(...bufs: (Uint8Array | undefined | null)[]): void {
  for (const b of bufs) {
    if (b instanceof Uint8Array) memzero(b);
  }
}
