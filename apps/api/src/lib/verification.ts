import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function generateNumericCode(digits = 6): string {
  if (digits < 4 || digits > 10) throw new Error('Invalid code length');
  let s = '';
  for (let i = 0; i < digits; i++) s += randomInt(0, 10).toString();
  return s;
}

export function generateVerificationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function timingEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}
